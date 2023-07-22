import {
  createDebug,
  createDebugWithName,
  getDebugName,
  isDebugTarget,
  printTriggerStack,
} from "./debug";
import {ReactiveEffect, track, TriggerInfo, triggerStack} from './effect'
import {reactive, ReactiveInterceptor, UnwrapReactive} from './reactive'
import {Cause} from "./patch";
import {isPlainObject, isReactivableType} from "./util";
import {Atom, atom, AtomInterceptor, isAtom} from "./atom";


// TODO 不深度 replace 吗？？？
export function replace(source: any, nextSourceValue: any) {
  if (Array.isArray(source)){
    source.splice(0, source.length, ...nextSourceValue)
  } else if (isPlainObject(source)){
    const nextKeys = Object.keys(nextSourceValue)
    const keysToDelete = Object.keys(source).filter(k => !nextKeys.includes(k))
    keysToDelete.forEach((k) => delete (source as {[k: string]: any})[k])
    Object.assign(source, nextSourceValue)
  } else if (source instanceof Map) {

    for(const key of source.keys()) {
      if (nextSourceValue.has(key)) {
        source.set(key, nextSourceValue.get(key))
      } else {
        source.delete(key)
      }
    }

    for(const key of nextSourceValue.keys()) {
      if (!source.has(key)) {
        source.set(key, nextSourceValue.get(key))
      }
    }

  } else if (source instanceof Set){
    source.forEach((item: any) => {
     if (!nextSourceValue.has(item)) source.delete(item)
    })

    nextSourceValue.forEach((item: any) => {
      if (!source.has(item)) source.add(item)
    })
  } else {
    throw new Error('unknown source type to replace data')
  }
}


export const computedToInternal = new WeakMap<any, ComputedInternal>()


export function destroyComputed(c: any) {
  const internal = computedToInternal.get(c)!
  internal.effect.stop()
  internal.onDestroy && internal.onDestroy(internal)
}


export type CallbacksType = {
  onRecompute? : (t: ComputedInternal) => void,
  onPatch? : (t: ComputedInternal) => void,
  onDestroy? : (t: ComputedInternal) => void,
  onTrack? : ReactiveEffect["onTrack"],
}


export type ComputedResult<T extends () => any> = ReturnType<T> extends object ? UnwrapReactive<ReturnType<T>> : Atom<ReturnType<T>>

export type ComputedData = Atom|UnwrapReactive<any>

type GetterType = (trackOnce?: typeof track ) => any
type DirtyCallback = (recompute: (force?: boolean) => void) => void




// TODO 为了进一步提高性能，应该允许用于自定义一个合并 triggerInfo 的函数
export class ComputedInternal {
  isDirty = false
  isPatchable = true
  data: ComputedData
  effect: ReactiveEffect
  immediate = false
  recomputing = false
  triggerInfos: TriggerInfo[] = []
  onDestroy?: (i: ComputedInternal) => void
  scheduleRecompute? :DirtyCallback
  constructor(public getter: GetterType, public applyPatch?: (computedData: ComputedData, info: TriggerInfo[]) => void, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType) {

    if (typeof scheduleRecompute === 'function') {
      this.scheduleRecompute = scheduleRecompute
    } else {
      this.immediate = true
    }

    this.effect = new ReactiveEffect(this.effectRun, (triggerInfo: TriggerInfo) => {
      this.isDirty = true
      if (this.immediate) {
        this.recompute()
      } else {
        this.triggerInfos.push(triggerInfo)
      }

      this.scheduleRecompute && this.scheduleRecompute(this.recompute)
    })
    this.effect.computed = this

    if (callbacks?.onDestroy) this.onDestroy = callbacks.onDestroy
    if (callbacks?.onTrack) this.effect.onTrack = callbacks.onTrack
    if (applyPatch) this.effect.patchMode = true

    // CAUTION 这里一定要执行 effect.run，因为 effect.run 本身是建立 effect 依赖的。
    const initialValue = this.effect.run()

    const interceptReactive: ReactiveInterceptor = (a0, a1, mutableHandlers: ProxyHandler<object>, ...rest) => {
      const mutableHandlersWithRecompute: typeof mutableHandlers = {
        ...mutableHandlers,
        get: (target, key, receiver) => {
          this.recompute()
          return mutableHandlers.get!(target, key, receiver)
        }
      }

      return [a0, a1, mutableHandlersWithRecompute, ...rest]
    }

    const that = this
    const interceptAtom: AtomInterceptor<any> = (updater, handler) => {
      // CAUTION 只能这样写才能支持 arguments.length === 0 ，否则就永远不会 为 0
      function updaterWithRecompute(newValue: Parameters<typeof updater>[0]) {
        const args = []
        if (arguments.length === 0) {
          that.recompute()
        } else {
          args.push(newValue)
        }
        return updater(...args)
      }

      const handlerWithRecompute: typeof handler = {
        ...handler,
        //以下 包括了读 toPrimitive 的时候， TODO 要不要把函数读取的排除出去？
        get: (target, key, receiver) => {
          this.recompute()
          return handler.get!(target,key, receiver)
        },
      }

      return [updaterWithRecompute, handlerWithRecompute]
    }

    this.data = isReactivableType(initialValue) ? reactive(initialValue, interceptReactive) : atom(initialValue, interceptAtom)
    // this.data = isReactivableType(initialValue) ? reactive(initialValue) : atom(initialValue)


    // destroy 的时候用户是拿 computed 去 destroy 的。
    computedToInternal.set(this.data, this)
  }
  effectRun = (trackOnce?: typeof track) => {
    // 初次执行 effectRun，用于建立依赖
    if (!this.data) return this.getter(trackOnce)

    // CAUTION 重新执行，也是用 update 来做数据的深度对比。
    // TODO check dep 进一步提升性能？
    if (isAtom(this.data)) {
      this.data(this.getter(trackOnce))
    } else {
      replace(this.data, this.getter(trackOnce))
    }
  }
  recompute = (forceRecompute = false) => {
    if (!this.isDirty || this.recomputing) return

    if (__DEV__) {
      if (isDebugTarget(this.getter)) {
        printTriggerStack(triggerStack)
        console.log(getDebugName(this.getter))
        debugger
      }
    }

    this.recomputing = true
    if (forceRecompute || !this.applyPatch || !this.isPatchable) {
      this.effect.run()
    } else {
      this.applyPatch(this.data, this.triggerInfos)
      this.triggerInfos.length = 0
    }

    this.isDirty = false
    this.recomputing = false
    if (this.callbacks?.onRecompute) this.callbacks?.onRecompute(this.data)
  }
}


type ApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => void

// export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export function computed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) {
  const internal = new ComputedInternal(getter, applyPatch, dirtyCallback, callbacks)
  return internal.data
}

computed.as = createDebugWithName(computed)
computed.debug = createDebug(computed)

export function recompute(computedItem: ComputedData, force = false) {
  const internal = computedToInternal.get(computedItem)!
  internal.recompute(force)
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

export function isComputed(target: any) {
  return !!computedToInternal.get(target)
}

export function getComputedGetter(target: any) {
  return computedToInternal.get(target)?.getter
}

