import {createDebug, createDebugWithName, getDebugName,} from "./debug";
import {Notifier, TriggerInfo} from './notify'
import {reactive, toRaw, UnwrapReactive} from './reactive'
import {assert, isPlainObject, isReactivableType} from "./util";
import {Atom, atom, isAtom} from "./atom";
import {ReactiveEffect} from "./reactiveEffect.js";
import {TrackOpTypes} from "./operations.js";


// CAUTION 为了一般场景中的新能，不深度 replace!
//  用户可以通过 computed 的再封装实现对某个 computed 结果的深度监听。
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

export const computedToInternal = new WeakMap<any, Computed>()

export type CallbacksType = {
  onRecompute? : (t: Computed) => void,
  onPatch? : (t: Computed) => void,
  onDestroy? : (t: ReactiveEffect) => void,
  onTrack? : ReactiveEffect["onTrack"],
}


export type ComputedResult<T extends () => any> = ReturnType<T> extends object ? UnwrapReactive<ReturnType<T>> : Atom<ReturnType<T>>

export type ComputedData = Atom|UnwrapReactive<any>
export type ApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => ReturnType<typeof computed>[] | void

export type GetterType = (trackOnce?: Notifier["track"], collect?: typeof ReactiveEffect.collectEffect ) => any
export type DirtyCallback = (recompute: (force?: boolean) => void) => void
export type SkipIndicator = {skip: boolean}


export function destroyComputed (computedItem: ComputedData)  {
    const internal = computedToInternal.get(computedItem)!
    ReactiveEffect.destroy(internal)
}

export class Computed extends ReactiveEffect{
  isDirty = false
  data: ComputedData
  immediate = false
  recomputing = false
  triggerInfos: TriggerInfo[] = []
  // 在 parent.innerComputeds 中的 index, 用来加速 destroy 的过程
  onDestroy?: (i: ReactiveEffect) => void
  scheduleRecompute? :DirtyCallback
  // 用来 patch 模式下，收集新增和删除是产生的 effectFrames
  effectFramesArray: ReactiveEffect[][] = []
  keyToEffectFrames: WeakMap<any, ReactiveEffect[]> = new WeakMap()
  // TODO 需要一个更好的约定
  public get debugName() {
    return getDebugName(this.data)
  }
  constructor(public getter?: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType, public skipIndicator? : SkipIndicator, public forceAtom?: boolean, public keepRaw?: boolean) {
    super(!!getter)
    // 这是为了支持有的数据结构想写成 source/computed 都支持的情况，比如 RxList。它会继承 Computed
    if (!getter) return

    if (typeof scheduleRecompute === 'function') {
      this.scheduleRecompute = scheduleRecompute
    } else {
      this.immediate = true
    }

    if (callbacks?.onDestroy) this.onDestroy = callbacks.onDestroy
    if (callbacks?.onTrack) this.onTrack = callbacks.onTrack

    const initialValue = super.run()!

    this.data = this.keepRaw ?
        initialValue:
        (this.forceAtom ?
          atom(initialValue) :
          isReactivableType(initialValue) ?
              reactive(initialValue) :
              atom(initialValue)
        )

    // destroy 的时候用户是拿 computed 去 destroy 的。
    if (!this.keepRaw) {
      computedToInternal.set(this.data, this)
    }
  }
  effectFn() {
    if (this.applyPatch) {
      // 增量计算，只有第一次计算建立初始 dep 会走到这。这里用的是手动 track。所以先把自动 track 停掉
      Notifier.instance.pauseTracking()
      // 用户在即在 computation 里面的 this 上可以拿到 manualTrack 来手动 track
      const result = this.getter!.call(this)

      Notifier.instance.resetTracking()

      return result
    } else {
      // 全部全量计算的情况
      return this.getter!.call(this)
    }
  }
  // trigger 时调用
  run(infos: TriggerInfo[]) {
    if (this.skipIndicator?.skip) return
    this.triggerInfos.push(...infos)
    this.isDirty = true
    if (this.immediate) {
      this.recompute()
    } else {
      this.scheduleRecompute!(this.recompute)
    }
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
      // CAUTION patch 要自己负责 destroy inner computed。理论上也不应该 track 新的数据，而是一直 track Method 和 explicit key change
      Notifier.instance.pauseTracking()
      this.applyPatch.call(this, this.data, this.triggerInfos)
      Notifier.instance.resetTracking()
      this.triggerInfos.length = 0
    }

    this.isDirty = false
  }
  // 给继承者在 apply catch 中用的 工具函数
  manualTrack = (target: object, type: TrackOpTypes, key: unknown) => {
    Notifier.instance.enableTracking()
    // CAUTION，为了方便手动 track 写法，这里会自动 toRaw，这样用户就不需要使用 toRaw 了。
    const dep = Notifier.instance.track(toRaw(target), type, key)
    Notifier.instance.resetTracking()
    return dep
  }
  collectEffect = ReactiveEffect.collectEffect
  destroyEffect = ReactiveEffect.destroy
}

// export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean) : ComputedResult<T>
export function computed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean) {
  const internal = new Computed(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, forceAtom)
  return internal.data
}

export function atomComputed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType, skipIndicator?: SkipIndicator) {
  const internal = new Computed(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, true)
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

