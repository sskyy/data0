import {createDebug, createDebugWithName, getDebugName,} from "./debug";
import {Notifier, TriggerInfo} from './notify'
import {reactive, toRaw, UnwrapReactive} from './reactive'
import {assert, isGenerator, isReactivableType, replace, uuid} from "./util";
import {Atom, atom, isAtom} from "./atom";
import {ReactiveEffect} from "./reactiveEffect.js";
import {TrackOpTypes} from "./operations.js";


export const computedToInternal = new WeakMap<any, Computed>()

export type CallbacksType = {
    onRecompute?: (data: any) => void,
    onCleanup?: (data: any) => void,
    onPatch?: (t: Computed) => void,
    onDestroy?: (t: ReactiveEffect) => void,
    onTrack?: Parameters<ReactiveEffect["on"]>[1],
}


export type ComputedResult<T extends GetterType> = ReturnType<T> extends object ? UnwrapReactive<ReturnType<T>> : Atom<ReturnType<T>>

export type ComputedData = Atom | UnwrapReactive<any>
export type SimpleApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => any
export type GeneratorApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => Generator<any, string, boolean>
export type ApplyPatchType = SimpleApplyPatchType | GeneratorApplyPatchType



export type GetterContext = {
    onCleanup: (fn: () => any) => void,
    asyncStatus: Atom<null | boolean | string>,
}

export type GetterType = (context: GetterContext) => any
export type GeneratorGetterType = (context: GetterContext) => Generator<any, string, boolean>
export type DirtyCallback = (recompute: (force?: boolean) => void) => void
export type SkipIndicator = { skip: boolean }


export function destroyComputed(computedItem: ComputedData) {
    const internal = computedToInternal.get(computedItem)!
    ReactiveEffect.destroy(internal)
}


/**
 * 计算和建立依赖过程。这里因为要支持 async / patch 模式，所以完全覆盖了 ReactiveEffect 的行为。
 * 1. 无 patch 模式，全量计算，每次都会重新收集依赖。
 *   1.1 第一次 callAutoTrackGetter
 *   1.2 重算 recompute -> callAutoTrackGetter
 * 2. patch 模式，增量计算
 *   2.1 第一次 callManualTrackGetter
 *   2.2 重算 recompute -> applyPatch
 *   2.3 强制重算 recompute(true) -> callManualTrackGetter
 */
export class Computed extends ReactiveEffect {
    isDirty = false
    data: ComputedData
    immediate = false
    recomputing = false
    isAsync = false
    runtEffectId?: string
    asyncStatus?: Atom<null | boolean | string>
    triggerInfos: TriggerInfo[] = []
    scheduleRecompute?: DirtyCallback
    // 用来 patch 模式下，收集新增和删除是产生的 effectFrames
    effectFramesArray: ReactiveEffect[][] = []
    keyToEffectFrames: WeakMap<any, ReactiveEffect[]> = new WeakMap()
    manualTracking = false
    // TODO 需要一个更好的约定
    public get debugName() {
        return getDebugName(this.data)
    }

    constructor(public getter?: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks?: CallbacksType, public skipIndicator?: SkipIndicator, public forceAtom?: boolean) {
        super(getter)
        // 这是为了支持有的数据结构想写成 source/computed 都支持的情况，比如 RxList。它会继承 Computed
        if (!getter) return

        if (isGenerator(getter)) {
            this.isAsync = true
            this.asyncStatus = atom(null)
        }

        this.manualTracking = !!applyPatch

        if (typeof scheduleRecompute === 'function') {
            this.scheduleRecompute = scheduleRecompute
        } else {
            this.immediate = true
        }

        if (callbacks?.onDestroy) this.on('destroy', callbacks.onDestroy)
        if (callbacks?.onTrack) this.on('track', callbacks.onTrack)
        if (callbacks?.onRecompute) this.on('recompute', callbacks.onRecompute)
        if (callbacks?.onCleanup) this.on('cleanup', callbacks.onCleanup)
    }

    runEffect() {
        let getterResult

        if (this.isAsync) {
            const runEffectId = uuid()
            this.runtEffectId = runEffectId

            // 说明上一次的还在执行中！，立即设为 false，再重新开始
            if(this.asyncStatus!()) {
                this.asyncStatus!(false)
            }
            this.asyncStatus!(true)
            getterResult = this.callGeneratorGetter(runEffectId)
            getterResult.then(data => {
                if (this.runtEffectId !== runEffectId) return false

                this.replaceData(data)
                this.asyncStatus!(false)
                this.isDirty = false
            })
        } else {
            getterResult = this.callSimpleGetter()
            this.replaceData(getterResult)
            this.isDirty = false
        }

        return getterResult
    }

    callGeneratorGetter = (id:string) => {
        const runEffectId = id
        const getterContext = this.createGetterContext()
        return this.runGenerator(
            this.getter!.call(this, getterContext!),
            (isFirst) => {
                if (runEffectId !== this.runtEffectId) return false

                this.prepareTracking(isFirst)
                this.manualTracking ? Notifier.instance.pauseTracking() : Notifier.instance.enableTracking()
            },
            (isLast) => {
                Notifier.instance.resetTracking()
                this.completeTracking()
            }
        )
    }

    callSimpleGetter() {
        const getterContext = this.createGetterContext()
        this.prepareTracking()
        this.manualTracking ? Notifier.instance.pauseTracking() : Notifier.instance.enableTracking()
        const result = this.getter!.call(this, getterContext!)
        Notifier.instance.resetTracking()
        this.completeTracking()
        return result
    }

    createGetterContext(): GetterContext | undefined {
        return (this.getter && this.getter?.length > 0) ? {
            onCleanup: (fn: () => any) => this.lastCleanupFn = fn,
            asyncStatus: this.asyncStatus!,
        } : undefined
    }

    callGetter() {
        const getterContext = this.createGetterContext()
        return this.getter!.call(this, getterContext!)
    }

    // dep trigger 时调用
    run(infos: TriggerInfo[]) {
        if (this.skipIndicator?.skip) return
        this.triggerInfos.push(...infos)
        this.isDirty = true
        if (this.immediate) {
            this.recompute()
        } else {
            // FIXME 用户需要更强的控制能力，例如 async patch 模式下，可能根据队列长度决定是否要完全重算。
            this.scheduleRecompute!(this.recompute)
        }
    }

    // 由 this.run 调用
    recompute = async (forceRecompute = false) => {
        if (!this.isDirty && !forceRecompute) return

        // 可以用于清理一些用户自己的副作用。
        // 这里用了两个名字，onCleanup 是为了和 rxList 中的 api 一致。
        // onRecompute 可以用作 log 等其他副作用
        this.dispatch('recompute', this.data)
        this.dispatch('cleanup', this.data)
        // 使用 context 注册的 cleanup
        if (this.lastCleanupFn) {
            this.lastCleanupFn()
        }

        // 下面的 super.run 和 applyPatch 都有可能是 async 的。
        if (forceRecompute || !this.applyPatch) {
            // 默认行为，重算并且重新收集依赖
            // CAUTION 用户一定要自己保证在第一次 await 之前读取了所有依赖。
            this.runEffect()
        } else {
            // patch 模式
            // CAUTION patch 要自己负责 destroy inner computed。理论上也不应该 track 新的数据，而是一直 track Method 和 explicit key change
            this.runPatch()
        }
    }
    runPatch() {
        if (isGenerator(this.applyPatch!)) {
            this.runGeneratorPatch()
        } else {
            this.runSimplePatch()
        }
    }
    runSimplePatch() {
        Notifier.instance.pauseTracking();
        (this.applyPatch as SimpleApplyPatchType).call(this, this.data, this.triggerInfos)
        Notifier.instance.resetTracking()
        this.triggerInfos.length = 0
    }
    public waitingTriggerInfos: TriggerInfo[] = []
    runGeneratorPatch() {
        this.waitingTriggerInfos.push(...this.triggerInfos)
        this.triggerInfos.length =0
        if(!this.waitingTriggerInfos.length) return

        if (!this.asyncStatus!()) {
            const generator = (this.applyPatch! as GeneratorApplyPatchType).call(this, this.data, [...this.waitingTriggerInfos])
            this.waitingTriggerInfos.length = 0

            this.asyncStatus!(true)
            // FIXME 要形成队列，不然可能第一个还没执行完，第二个就触发了。
            this.runGenerator(generator,
                (isFirst) => {
                    Notifier.instance.pauseTracking()
                },
                (isLast) => {
                    Notifier.instance.resetTracking()
                }
            ).then(() =>{
                this.asyncStatus!(false)
                // 继续递归检查还有没有 waitingTriggerInfos
                this.runGeneratorPatch()
            })
        }
    }
    public lastCleanupFn?: () => void

    // rxList/rxMap 必须覆写
    replaceData(newData: any) {

    }

    // 给继承者在 apply catch 中用的 工具函数
    manualTrack = (target: object, type: TrackOpTypes, key: unknown) => {
        Notifier.instance.enableTracking()
        // CAUTION，为了方便手动 track 写法，这里会自动 toRaw，这样用户就不需要使用 toRaw 了。
        const dep = Notifier.instance.track(isAtom(target) ? target : toRaw(target), type, key)
        Notifier.instance.resetTracking()
        return dep
    }
    collectEffect = ReactiveEffect.collectEffect
    destroyEffect = ReactiveEffect.destroy
}

// export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks?: CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean): ComputedResult<T>
export function computed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks?: CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean, asyncInitialValue?: any): ComputedData {
    const internal = new Computed(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, forceAtom)
    if (internal.isAsync) {
        assert(!(asyncInitialValue === undefined && forceAtom === undefined), 'async getter must use setInitialValue to set initial value.')
        internal.data = forceAtom ? atom<any>(null) : asyncInitialValue
    }
    const initialValue = internal.runEffect()

    if (!internal.isAsync) {
        // 自动判断 data
        internal.data = (forceAtom ?
            atom(initialValue) :
            isReactivableType(initialValue) ?
                reactive(initialValue) :
                atom(initialValue)
        )
    }
    internal.replaceData = function(newData: any) {
        if (isAtom(this.data)) {
            this.data(newData)
        } else {
            replace(this.data, newData)
        }
    }

    computedToInternal.set(internal.data, internal)
    return internal.data
}

export function atomComputed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return computed(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, true)
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

