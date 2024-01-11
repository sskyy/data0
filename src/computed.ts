import {
  createDebug,
  createDebugWithName,
  getDebugName,
  isDebugTarget,
  printTriggerStack,
} from "./debug";
import {ReactiveEffect, track, InputTriggerInfo, triggerStack} from './effect'
import {reactive, ReactiveInterceptor, UnwrapReactive} from './reactive'
import {assert, isPlainObject, isReactivableType} from "./util";
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
    assert(false, 'unknown source type to replace data')
  }
}


export const computedToInternal = new WeakMap<any, ComputedInternal>()


export function destroyComputed(c: any, fromParent?: boolean) {
  const internal = computedToInternal.get(c)!
  return destroyComputedInternal(internal, fromParent)
}

function destroyComputedInternal(internal: ComputedInternal, fromParent?: boolean) {
  internal.effect.stop()
  internal.onDestroy && internal.onDestroy(internal)

  if (!fromParent && internal.parent) {
    // 要把自己从 parent.innerComputeds 中移除掉。直接用 last 替换掉当前的要上出的，提升删除速度。
    const last = internal.parent.innerComputeds.pop()!
    if (last !== internal) {
      internal.parent.innerComputeds[internal.index!] = last
      last.index = internal.index
    }
  }

  delete internal.parent
  internal.innerComputeds.forEach(inner => destroyComputedInternal(inner, true))
  internal.innerComputeds.length = 0

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
type SkipIndicator = {skip: boolean}

const activeComputedInternals:ComputedInternal[] = []
function activateComputed(internal: ComputedInternal) {
  activeComputedInternals.push(internal)
}

function resetActiveComputed() {
  activeComputedInternals.pop()
}

function linkToParentComputed(internal: ComputedInternal) {
  const current = activeComputedInternals.at(-1)
  if (current) {
    internal.parent = current
    current.innerComputeds.push(internal)
    internal.index = current.innerComputeds.length -1
  }
}

// TODO 为了进一步提高性能，应该允许用于自定义一个合并 triggerInfo 的函数
export class ComputedInternal {
  isDirty = false
  isPatchable = true
  data: ComputedData
  effect: ReactiveEffect
  immediate = false
  recomputing = false
  triggerInfos: InputTriggerInfo[] = []
  innerComputeds: ComputedInternal[] = []
  parent?: ComputedInternal
  // 在 parent.innerComputeds 中的 index, 用来加速 destroy 的过程
  index?: number
  onDestroy?: (i: ComputedInternal) => void
  scheduleRecompute? :DirtyCallback
  // TODO 需要一个更好的约定
  public get debugName() {
    return getDebugName(this.data)
  }
  constructor(public getter: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType, public skipIndicator? : SkipIndicator, public forceAtom?: boolean) {

    if (typeof scheduleRecompute === 'function') {
      this.scheduleRecompute = scheduleRecompute
    } else {
      this.immediate = true
    }

    this.effect = new ReactiveEffect(this.effectRun, (triggerInfo: InputTriggerInfo) => {
      this.isDirty = true
      if (this.immediate) {
        this.recompute()
      } else {
        this.triggerInfos.push(triggerInfo)
      }

      this.scheduleRecompute && this.scheduleRecompute(this.recompute)
    }, this.skipIndicator)
    this.effect.computed = this

    if (callbacks?.onDestroy) this.onDestroy = callbacks.onDestroy
    if (callbacks?.onTrack) this.effect.onTrack = callbacks.onTrack
    if (applyPatch) this.effect.patchMode = true

    // CAUTION 这里一定要执行 effect.run，因为 effect.run 本身是建立 effect 依赖的。
    // TODO 这个 activate 需不需要更好的和 effect 绑定？目前就是手动卸载 constructor 和 recompute 里面的
    activateComputed(this)
    const initialValue = this.effect.run()
    resetActiveComputed()

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

    this.data = this.forceAtom ?
        atom(initialValue, interceptAtom) :
        isReactivableType(initialValue) ?
          reactive(initialValue, interceptReactive) :
          atom(initialValue, interceptAtom)

    // destroy 的时候用户是拿 computed 去 destroy 的。
    computedToInternal.set(this.data, this)
    linkToParentComputed(this)
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
      }
    }

    // TODO destroy innerComputeds

    this.recomputing = true
    activateComputed(this)
    if (forceRecompute || !this.applyPatch || !this.isPatchable) {
      // CAUTION 每一次重算前，都自动 destroy innerComputed，然后重新收集。
      this.innerComputeds.forEach(internal => destroyComputedInternal(internal, true))
      this.innerComputeds.length = 0
      this.effect.run()
    } else {
      // CAUTION 每一次 patch，都是只负责收集新增 innerComputed，然后从 patch result 中获取要 destroy 的 innerComputed。
      const toDestroy = this.applyPatch(this.data, this.triggerInfos)
      if (toDestroy) {
        toDestroy.forEach( internal => destroyComputed(internal, true))
      }

      this.triggerInfos.length = 0
    }
    resetActiveComputed()

    this.isDirty = false
    this.recomputing = false
    if (this.callbacks?.onRecompute) this.callbacks?.onRecompute(this.data)
  }
}


type ApplyPatchType = (computedData: ComputedData, info: InputTriggerInfo[]) => ReturnType<typeof computed>[] | void

// export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean) : ComputedResult<T>
export function computed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean) {
  const internal = new ComputedInternal(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, forceAtom)
  return internal.data
}

export function atomComputed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType, skipIndicator?: SkipIndicator) {
  const internal = new ComputedInternal(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, true)
  return internal.data
}

computed.as = createDebugWithName(computed)
computed.debug = createDebug(computed)

export function recompute(computedItem: ComputedData, force = false) {
  const internal = computedToInternal.get(computedItem)!
  internal.recompute(force)
}


export function isComputed(target: any) {
  return !!computedToInternal.get(target)
}

export function getComputedGetter(target: any) {
  return computedToInternal.get(target)?.getter
}

