import {createDebug, createDebugWithName, getDebugName,} from "./debug";
import {DebuggerEventExtraInfo, InputTriggerInfo, Notifier, TriggerInfo} from './notify'
import {reactive, toRaw, UnwrapReactive} from './reactive'
import {assert, isPlainObject, isReactivableType} from "./util";
import {Atom, atom, isAtom} from "./atom";
import {ReactiveEffect} from "./reactiveEffect.js";
import {TrackOpTypes} from "./operations.js";


// TODO 不深度 replace 吗？？？
export function replace(source: any, nextSourceValue: any) {
  if (Array.isArray(source)){
    source.splice(0, Infinity, ...nextSourceValue)
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




export type CallbacksType = {
  onRecompute? : (t: ComputedInternal) => void,
  onPatch? : (t: ComputedInternal) => void,
  onDestroy? : (t: ComputedInternal) => void,
  onTrack? : ReactiveEffect["onTrack"],
}


export type ComputedResult<T extends () => any> = ReturnType<T> extends object ? UnwrapReactive<ReturnType<T>> : Atom<ReturnType<T>>

export type ComputedData = Atom|UnwrapReactive<any>

type GetterType = (trackOnce?: Notifier["track"] ) => any
type DirtyCallback = (recompute: (force?: boolean) => void) => void
type SkipIndicator = {skip: boolean}


export function destroyComputed (computedItem: ComputedData)  {
    const internal = computedToInternal.get(computedItem)!
    ReactiveEffect.destroy(internal)
}

export class ComputedInternal extends ReactiveEffect{
  isDirty = false
  data: ComputedData
  immediate = false
  recomputing = false
  triggerInfos: InputTriggerInfo[] = []
  // 在 parent.innerComputeds 中的 index, 用来加速 destroy 的过程
  onDestroy?: (i: ComputedInternal) => void
  scheduleRecompute? :DirtyCallback
  // TODO 需要一个更好的约定
  public get debugName() {
    return getDebugName(this.data)
  }
  constructor(public getter: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType, public skipIndicator? : SkipIndicator, public forceAtom?: boolean) {
    super()

    if (typeof scheduleRecompute === 'function') {
      this.scheduleRecompute = scheduleRecompute
    } else {
      this.immediate = true
    }

    if (callbacks?.onDestroy) this.onDestroy = callbacks.onDestroy
    if (callbacks?.onTrack) this.onTrack = callbacks.onTrack


    const  initialValue = super.run()!

    // FIXME 为什么自己在读的时候要触发一下 recompute？？？
    // const interceptReactive: ReactiveInterceptor = (a0, a1, mutableHandlers: ProxyHandler<object>, ...rest) => {
    //   const mutableHandlersWithRecompute: typeof mutableHandlers = {
    //     ...mutableHandlers,
    //     get: (target, key, receiver) => {
    //       this.recompute()
    //       return mutableHandlers.get!(target, key, receiver)
    //     }
    //   }
    //
    //   return [a0, a1, mutableHandlersWithRecompute, ...rest]
    // }

    // const that = this
    // const interceptAtom: AtomInterceptor<any> = (updater, handler) => {
    //   // CAUTION 只能这样写才能支持 arguments.length === 0 ，否则就永远不会 为 0
    //   function updaterWithRecompute(newValue: Parameters<typeof updater>[0]) {
    //     const args = []
    //     if (arguments.length === 0) {
    //       that.recompute()
    //     } else {
    //       args.push(newValue)
    //     }
    //     return updater(...args)
    //   }
    //
    //   const handlerWithRecompute: typeof handler = {
    //     ...handler,
    //     //以下 包括了读 toPrimitive 的时候， TODO 要不要把函数读取的排除出去？
    //     get: (target, key, receiver) => {
    //       this.recompute()
    //       return handler.get!(target,key, receiver)
    //     },
    //   }
    //
    //   return [updaterWithRecompute, handlerWithRecompute]
    // }

    // this.data = this.forceAtom ?
    //     atom(initialValue, interceptAtom) :
    //     isReactivableType(initialValue) ?
    //       reactive(initialValue, interceptReactive) :
    //       atom(initialValue, interceptAtom)
    this.data = this.forceAtom ?
        atom(initialValue) :
        isReactivableType(initialValue) ?
            reactive(initialValue) :
            atom(initialValue)

    // destroy 的时候用户是拿 computed 去 destroy 的。
    computedToInternal.set(this.data, this)
  }
  effectFn() {
    if (this.applyPatch) {
      // 增量计算，只有第一次计算建立初始 dep 会走到这。这里用的是手动 track。所以先把自动 track 停掉
      Notifier.instance.pauseTracking()

      const manualTrack =  (target: object, type: TrackOpTypes, key: unknown) => {
        Notifier.instance.enableTracking()
        // CAUTION，为了方便手动 track 写法，这里会自动 toRaw，这样用户就不需要使用 toRaw 了。
        Notifier.instance.track(toRaw(target), type, key)
        Notifier.instance.resetTracking()
      }
      const result = this.getter(manualTrack)

      Notifier.instance.resetTracking()

      return result
    } else {
      // 全部全量计算的情况
      return this.getter()
    }
  }
  // trigger 时调用
  run(info: TriggerInfo, debuggerEventExtraInfo?: DebuggerEventExtraInfo) {
    if (this.skipIndicator?.skip) return
    this.isDirty = true
    if (this.immediate) {
      this.recompute()
    } else {
      this.triggerInfos.push(info)
    }
    this.scheduleRecompute && this.scheduleRecompute(this.recompute)
  }
  recompute = (forceRecompute = false) => {
    if (!this.isDirty && !forceRecompute) return
    if (forceRecompute || !this.applyPatch) {
      // 默认行为，重算并且重新收集依赖
      const newData = super.run()
      if (isAtom(this.data)) {
        this.data(newData)
      } else {
        replace(this.data, newData)
      }
    } else {
      // CAUTION patch 要自己负责 destroy inner computed
      this.applyPatch(this.data, this.triggerInfos, ReactiveEffect.destroy)
      this.triggerInfos.length = 0
    }

    this.isDirty = false
  }
}


type ApplyPatchType = (computedData: ComputedData, info: InputTriggerInfo[], destroy: typeof ReactiveEffect["destroy"]) => ReturnType<typeof computed>[] | void

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

// 强制重算
export function recompute(computedItem: ComputedData, force = false) {
  const internal = computedToInternal.get(computedItem)!
  internal.recompute(force)
}

// 目前 debug 用的
export function isComputed(target: any) {
  return !!computedToInternal.get(target)
}

// debug 时用的
export function getComputedGetter(target: any) {
  return computedToInternal.get(target)?.getter
}

