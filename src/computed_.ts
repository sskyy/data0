import { ReactiveEffect} from './effect'
import {reactive, UnwrapReactive} from './reactive'
import {registerPatchFns, Cause, addAfterPatchPointerCallback, inAfterPatchPointerFrame} from "./patch";
import {isReactivableType} from "./util";
import {Atom, atom, isAtom, UpdateFn} from "./atom";


export function replace(source: any, nextSourceValue: any) {
  if (Array.isArray(source)){
    source.splice(0, source.length, ...nextSourceValue)
  } else {
    const nextKeys = Object.keys(nextSourceValue)
    const keysToDelete = Object.keys(source).filter(k => !nextKeys.includes(k))
    keysToDelete.forEach(k => delete source[k])
    Object.assign(source, nextSourceValue)
  }
}


export const computedToInternal = new WeakMap<any, ComputedInternal>()

export function destroyComputed(c: any) {
  computedToInternal.get(c)!.effect.stop()
}



export type RegisterPatchFnType = ({ on, addTrack, untrack } : {on: Function, addTrack: Function, untrack: Function}) => any



export type CallbacksType = {
  onRecompute? : Function,
  onPatch? : Function,
  onTrack? : ReactiveEffect["onTrack"],
}


export type ComputedResult<T extends () => any> = ReturnType<T> extends object ? UnwrapReactive<ReturnType<T>> : Atom<ReturnType<T>>


export class ComputedInternal {
  isDirty = false
  isPatchable = false
  applyPatch?: Function
  data: Atom|UnwrapReactive<any>
  computed: Atom|UnwrapReactive<any>
  effect: ReactiveEffect
  isImmediateUpdateExpired = false
  constructor(public getter: () => any, registerPatchFn?: RegisterPatchFnType, public dirtyCallback?: any, public callbacks? : CallbacksType) {

    this.effect = new ReactiveEffect(this.effectRun, (cause, debugInfo) => {
      this.isDirty = true
      // 只记录写了 patch 但是没走 patch 的。
      if(this.applyPatch) {
        // patchable 方法必然有 cause，如果由不是 patch 监听的方法触发的变化，就说明当前的变化不能 patch。
        // console.log('dirty, prev isPatchable:', isPatchable, cause)
        // if (!cause) debugger
        // 在触发之前，所有 patchPoint 都会先通知一下相关的 lazyComputed 开始收集了。
        // 如果当前 cause 不是自己注册了 patchPoint 的，那么就不能走 patch 了。
        this.isPatchable = this.isPatchable && (!!cause) && (getCauses(this.computed)?.at(-1) === cause)
        if (!this.isPatchable) {
          // debugger
          console.warn('cant patch:', { computed: this.computed, cause }, getCauses(this.computed)?.at(-1), getCauses(this.computed)?.at(-1) === cause)
        }
      }

      // CAUTION 这里要限制一下，如果要用，addAfterPatchPointerCallback 只能马上使用。不然注册的 callback frame 就不正确了。
      this.isImmediateUpdateExpired = false
      if (this.dirtyCallback) {
        this.dirtyCallback(() => {
          if (this.isImmediateUpdateExpired) throw new Error('immediateUpdate expired')
          if (inAfterPatchPointerFrame()) {
            addAfterPatchPointerCallback(this.recompute)
          } else {
            Promise.resolve().then(this.recompute)
          }
        })
      }

      this.isImmediateUpdateExpired = true
    })

    if (callbacks?.onTrack) this.effect.onTrack = callbacks.onTrack

    // CAUTION 这里一定要执行 effect.run，因为 effect.run 本身是建立 effect 依赖的。
    const initialValue = this.effect.run()
    this.data = isReactivableType(initialValue) ? reactive(initialValue) : atom(initialValue)

    this.computed = isAtom(this.data!) ?
      // 针对数字和字符串的情况，还是可以用函数来读。也支持使用 Symbol.toPrimitive 去读（使用 +/== 的operator 时）
      new Proxy((newValue? : any | UpdateFn<any>) => {
        if (arguments.length === 0) {
          this.recompute()
        }
        return (this.data as Atom)(newValue)
      }, {
        get: (target, key, receiver) =>{
          this.recompute()
          return Reflect.get(this.data, key)
        }
      }) :
      new Proxy(this.data!, {
        get: (target, key, receiver) => {
          // 获取任何值得时候 check dirty TODO 但是读方法的时候应该不用，这里应该拆出去？
          this.recompute()
          return Reflect.get(target,key)
        }
      })

    this.applyPatch = registerPatchFn ? registerPatchFns(this, registerPatchFn) : undefined

    // destroy 的时候用户是拿 computed 去 destroy 的。
    computedToInternal.set(this.computed, this)
  }
  effectRun = () => {
    // 初次执行 effectRun，用于建立依赖
    if (!this.data) return this.getter()


    if (this.applyPatch && this.isPatchable) {
      // CAUTION 会清空 triggerCause
      this.applyPatch!(this.data)
      if (this.callbacks?.onPatch) this.callbacks?.onPatch(this.data)

    } else {
      // TODO check dep?
      if (isAtom(this.data)) {
        this.data(this.getter())
      } else {
        replace(this.data, this.getter())
      }

      if (this.callbacks?.onRecompute) this.callbacks?.onRecompute(this.data)
    }
    if (this.applyPatch) this.isPatchable = true
  }
  recompute () {
    if (this.isDirty) {
      // CAUTION 必须在 run 之前判断自己能不能开启 patchMode 啊，因为此时
      if(this.isPatchable) {
        this.effect.patchMode = true
      }
      this.effect.run()
      this.effect.patchMode = false
      this.isDirty = false
    }
  }
}



export function computed<T extends () => any>(getter: T, registerPatchFn?: RegisterPatchFnType, dirtyCallback?: any, callbacks? : CallbacksType) : ComputedResult<T>
export function computed(getter: () => any, registerPatchFn?: RegisterPatchFnType, dirtyCallback?: any, callbacks? : CallbacksType) {
  const internal = new ComputedInternal(getter, registerPatchFn, dirtyCallback, callbacks)
  return internal.computed
}


const patchCauses = new WeakMap()
export function collectCause(computed: any, cause: Cause) {
  let causes
  if (!(causes = patchCauses.get(computed))) {
    patchCauses.set(computed, (causes = []))
  }
  causes.push(cause)
}

export function getCauses(computed: any) {
  return patchCauses.get(computed)
}

export function clearCauses(computed: any) {

  const causes = patchCauses.get(computed)
  if (causes) {
    causes.length = 0
  }
}
