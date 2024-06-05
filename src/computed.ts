import {createDebug, createDebugWithName, getDebugName,} from "./debug";
import {Notifier, TriggerInfo} from './notify'
import {reactive, toRaw, UnwrapReactive} from './reactive'
import {assert, isAsync, isGenerator, isReactivableType, replace, uuid, warn} from "./util";
import {Atom, atom, isAtom} from "./atom";
import {ReactiveEffect} from "./reactiveEffect.js";
import {TrackOpTypes} from "./operations.js";


export let defaultScheduleRecomputedAsLazy = true
export const setDefaultScheduleRecomputedAsLazy = (lazy = true) => {
    defaultScheduleRecomputedAsLazy = lazy
}

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
export type AsyncApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => Promise<any>
export type GeneratorApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => Generator<any, string, boolean>
export type ApplyPatchType = SimpleApplyPatchType | GeneratorApplyPatchType



export type GetterContext = {
    onCleanup: (fn: () => any) => void,
    asyncStatus: Atom<null | boolean | string>,
}

export type GetterType = (context: GetterContext) => any
export type GeneratorGetterType = (context: GetterContext) => Generator<any, string, boolean>
export type DirtyCallback = (recompute: (force?: boolean) => void, markDirty: () => any) => void
export type SkipIndicator = { skip: boolean }


export function destroyComputed(computedItem: ComputedData) {
    const internal = computedToInternal.get(toRaw(computedItem))!
    ReactiveEffect.destroy(internal)
}

export function getComputedInternal(computedItem: ComputedData) {
    return computedToInternal.get(computedItem)
}

const queuedRecomputes = new WeakSet<Computed>()

// 如果是 async 的，用 queueMicrotask 来调度。
// 如果不是 async 的，用 markDirty 而不是直接 recompute
function defaultScheduleRecompute(this: Computed, recompute: (force?: boolean) => void, markDirty: () => any) {
    if (this.isAsync) {
        if (queuedRecomputes.has(this)) return
        queuedRecomputes.add(this)
        queueMicrotask(() => {
            recompute()
            queuedRecomputes.delete(this)
        })
    } else {
        if (defaultScheduleRecomputedAsLazy) {
            markDirty()
        } else {
            recompute()
        }
    }
}

export const STATUS_CLEAN = -1
export const STATUS_DIRTY = 1
export const STATUS_RECOMPUTING_DEPS = 2
export const STATUS_RECOMPUTING = 3

type StatusType = typeof STATUS_CLEAN | typeof STATUS_DIRTY | typeof STATUS_RECOMPUTING_DEPS | typeof STATUS_RECOMPUTING

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
    data: ComputedData
    trackClassInstance = false
    immediate = false
    // recomputing = false
    isAsync = false
    isPatchAsync? = false
    runtEffectId?: string
    asyncStatus?: Atom<null | boolean | string>
    status: Atom<StatusType> = atom(STATUS_CLEAN)
    triggerInfos: TriggerInfo[] = []
    scheduleRecompute?: DirtyCallback
    // 用来 patch 模式下，收集新增和删除是产生的 effectFrames
    effectFramesArray: ReactiveEffect[][] = []
    keyToEffectFrames: WeakMap<any, ReactiveEffect[]> = new WeakMap()
    manualTracking = false
    public dirtyFromDeps= new Set<Computed>()
    public markedDirtyEffects: Set<Set<Computed>> = new Set()
    // TODO 需要一个更好的约定
    public get debugName() {
        return getDebugName(this.data)
    }
    public static id = 0
    public id: number = Computed.id++
    public isAsyncGetter: boolean = false
    public isGeneratorGetter: boolean = false
    public isAsyncPatch: boolean = false
    public isGeneratorPatch: boolean = false
    constructor(public getter?: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback|true, public callbacks?: CallbacksType, public skipIndicator?: SkipIndicator, public forceAtom?: boolean) {
        super(getter)
        // 这是为了支持有的数据结构想写成 source/computed 都支持的情况，比如 RxList。它会继承 Computed
        if (!getter) return

        this.isAsyncGetter = isAsync(getter)
        this.isGeneratorGetter = isGenerator(getter)

        if (this.isAsyncGetter || this.isGeneratorGetter) {
            this.isAsync = true
            this.asyncStatus = atom(null)
        }

        this.manualTracking = !!applyPatch
        if (this.applyPatch) {
            this.isAsyncPatch = isAsync(this.applyPatch)
            this.isGeneratorPatch = isGenerator(this.applyPatch)
            this.isPatchAsync = this.isAsyncPatch|| this.isGeneratorPatch
        }

        if (typeof scheduleRecompute === 'function') {
            this.scheduleRecompute = scheduleRecompute
        } else if(scheduleRecompute ===true){
            this.immediate = true
        } else {
            this.scheduleRecompute = defaultScheduleRecompute.bind(this)
        }

        if (callbacks?.onDestroy) this.on('destroy', callbacks.onDestroy)
        if (callbacks?.onTrack) this.on('track', callbacks.onTrack)
        if (callbacks?.onRecompute) this.on('recompute', callbacks.onRecompute)
        if (callbacks?.onCleanup) this.on('cleanup', callbacks.onCleanup)
    }
    public effectPromise?: Promise<any>
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
            getterResult = this.isGeneratorGetter ? this.callGeneratorGetter(runEffectId) : this.callAsyncGetter()
            this.effectPromise = getterResult
            getterResult.then((data:any) => {
                if (this.runtEffectId !== runEffectId) return false

                this.replaceData(data)
                this.asyncStatus!(false)
                delete this.effectPromise
            })
        } else {
            getterResult = this.callSimpleGetter()
            this.replaceData(getterResult)
        }

        return getterResult
    }
    callAsyncGetter(): any {
        const getterContext = this.createGetterContext()
        warn('async getter can only track reactive data before first await. If you want to track more data, please use generator getter.')
        this.prepareTracking(true)
        this.manualTracking ? Notifier.instance.pauseTracking() : Notifier.instance.enableTracking()
        const result = this.getter!.call(this, getterContext!)
        Notifier.instance.resetTracking()
        this.completeTracking(true)
        return result
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
                this.completeTracking(isLast)
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


    // 这是传递给外部 scheduleRecompute 的，用来代理 notify 上的 recursiveMarkDirty
    recursiveMarkDirty = () => {
        // CAUTION Notifier.instance.getDepEffects 给的是去重的 Effect, 不然这里会触发多次无意义的 run
        const depEffects = Notifier.instance.getDepEffects(this.trackClassInstance ? this: this.data)
        if (!depEffects) return

        for(const effect of depEffects) {
            if (effect instanceof Computed) {
                effect.dirtyFromDeps.add(this)
                this.markedDirtyEffects.add(effect.dirtyFromDeps)
            }
            effect.run()
        }
    }
    // dep trigger/recursiveMarkDirty 时调用。没有 infos 说明是 markDirty
    run(infos?: TriggerInfo[]) {
        if (this.skipIndicator?.skip) return
        if (infos) {
            this.triggerInfos.push(...infos)
        }

        // markDirty
        if (this.status.raw === STATUS_CLEAN) {
            this.status(STATUS_DIRTY)
        }

        // 哪些情况可能出现 recomputing 过程中又触发了 run :
        // 1. 在 lazy recompute 模式下，可能出现依赖是一个 atomComputed，
        //  触发它的重算时会使得 atom trigger 重新触发 run，这个时候我们已经在 recomputing 了，
        //  只需要获取 info 就行了，不需要再次触发 recompute/schedule 了。
        // 2. 在 async 模式下，任何依赖都可以再触发 recompute。

        if (this.immediate || this.status.raw > STATUS_DIRTY) {
            this.recompute()
        } else {
            this.scheduleRecompute!(this.recompute, this.recursiveMarkDirty)
        }
    }
    // onTrack 由 notify 调用。
    onTrack() {
        if(this.status.raw !== STATUS_CLEAN) {
            // async computed 不会出现读时才计算的情况，所以不需要 await。
            this.recompute()
        }
        this.dispatch('track', this.data)
    }

    forceDirtyDepRecompute() {
        this.status(STATUS_RECOMPUTING_DEPS)
        const promises: Promise<any>[] = []
        while(this.dirtyFromDeps.size) {
            // CAUTION 不需要自己在这里把 this.dirtyFromDeps 清空，dep recompute 成功后会自己从 dirtyFromDeps 中移除自己。
            for(const effect of this.dirtyFromDeps) {
                if (effect.isAsync) {
                    promises.push(effect.recompute())
                } else {
                    effect.recompute()
                }
            }
        }
        return promises.length ? Promise.all(promises) : undefined
    }
    prepareRecompute() {
        this.status(STATUS_RECOMPUTING)
        // 可以用于清理一些用户自己的副作用。
        // 这里用了两个名字，onCleanup 是为了和 rxList 中的 api 一致。
        // onRecompute 可以用作 log 等其他副作用
        this.dispatch('recompute', this.data)
        this.dispatch('cleanup', this.data)
        // 使用 context 注册的 cleanup
        if (this.lastCleanupFn) {
            this.lastCleanupFn()
        }
    }
    completeRecompute() {
        // 重算阶段顺利完成，并且没有新的 dep 变脏，这里可以清理一些状态了。
        for(const effects of this.markedDirtyEffects) {
            effects.delete(this)
        }
        this.markedDirtyEffects.clear()
        this.status(STATUS_CLEAN)
    }

    async fullRecompute() {

        const promises = this.forceDirtyDepRecompute()
        if (promises) await promises

        this.prepareRecompute()
        // 默认行为，重算并且重新收集依赖
        // CAUTION 用户一定要自己保证在第一次 await 之前读取了所有依赖。
        if (this.isAsync) {
            // CAUTION 这里用不用 await 的区别在于，后面的代码会不会放到 next micro task 中执行。
            //  为了防止同步 computed 中最后的 isRecomputing 被放到了 micro task 中，使用户产生困惑（空户可能认为自己写的非 async 就应该同步就计算），所以这里要区分一下。
            await this.runEffect()
        } else {
            this.runEffect()
        }

        // 当前 patch 完成后，发现有 dep 变脏。不用管了，肯定已经创建了新的 recompute
        if(this.dirtyFromDeps.size) {
            return
        }

        // 顺利完成 recompute
        this.completeRecompute()
    }
    async patchRecompute() {
        const promises = this.forceDirtyDepRecompute()
        if (promises) await promises

        this.prepareRecompute()

        let patchResult:any
        if (this.isPatchAsync) {
            patchResult = await this.runPatch()
        } else {
            patchResult = this.runPatch()
        }
        // explicit return false 说明出现了无法 patch 的情况，表示一定要重算
        if (patchResult===false) {
            this.triggerInfos.length = 0
            if (this.isAsync) {
                // CAUTION 这里用不用 await 的区别在于，后面的代码会不会放到 next micro task 中执行。
                //  为了防止同步 computed 中最后的 isRecomputing 被放到了 micro task 中，使用户产生困惑（空户可能认为自己写的非 async 就应该同步就计算），所以这里要区分一下。
                await this.runEffect()
            } else {
                this.runEffect()
            }
        }

        // 当前 patch 完成后，发现有 dep 变脏。立刻重新执行一个 recompute
        if(this.dirtyFromDeps.size) {
            // 重置为 dirty，才能开启下一段 recompute
            this.status(STATUS_DIRTY)
            return this.recompute()
        }

        this.completeRecompute()
    }
    // 由 this.run 调用
    recompute = async (forceRecompute = false): Promise<any> => {
        if ((this.status.raw === STATUS_CLEAN && !forceRecompute) || !this.active) return

        const isFullRecompute = !this.applyPatch || forceRecompute

        if (this.status.raw > STATUS_DIRTY) {
            // 没到重算阶段，任何 dep dirty 变化都不需要管， 因为会自动加入到 dirtyFromDeps 中。
            if (this.status() < STATUS_RECOMPUTING) {
                return
            } else {
                // 已经到重算阶段，
                // 1. fullRecompute 要直接开启一个新的 recompute
                if (isFullRecompute) {
                    return this.fullRecompute()
                } else {
                    // 2. patchRecompute 会自行在上一个结尾处判断。所以这里也不用管了
                    return
                }
            }
        } else {
            if (isFullRecompute) {
                return this.fullRecompute()
            } else {
                return this.patchRecompute()
            }
        }
    }
    runPatch() {
        if (this.isAsyncPatch || this.isGeneratorPatch) {
            const patchPromise = this.isAsyncPatch ? this.runAsyncPatch() : this.runGeneratorPatch()
            this.effectPromise = patchPromise
            patchPromise.then(() => {
                delete this.effectPromise
            })
            return patchPromise
        } else {
            return this.runSimplePatch()
        }
    }
    runSimplePatch() {
        this.pauseAutoTrack()
        const patchResult = (this.applyPatch as SimpleApplyPatchType).call(this, this.data, this.triggerInfos)
        this.resetAutoTrack()
        this.triggerInfos.length = 0
        return patchResult
    }
    async runAsyncPatch() {
        let patchResult
        while(this.triggerInfos.length) {
            const waitingTriggerInfos = [...this.triggerInfos]
            this.triggerInfos.length = 0
            this.pauseAutoTrack()
            const patchPromise = (this.applyPatch as AsyncApplyPatchType).call(this, this.data, waitingTriggerInfos)
            this.resetAutoTrack()
            patchResult = await patchPromise
            if (patchResult === false) {
                break
            }
        }
        return patchResult
    }
    async runGeneratorPatch() {
        let patchResult

        while(this.triggerInfos.length) {
            const waitingTriggerInfos = [...this.triggerInfos]
            this.triggerInfos.length =0
            const generator = (this.applyPatch! as GeneratorApplyPatchType).call(this, this.data, waitingTriggerInfos)

            this.asyncStatus!(true)
            patchResult = await this.runGenerator(generator,
                (isFirst) => {
                    this.pauseAutoTrack()
                },
                (isLast) => {
                    this.resetAutoTrack()
                }
            )
            this.asyncStatus!(false)
        }

        return patchResult
    }
    public lastCleanupFn?: () => void

    // rxList/rxMap 必须覆写
    replaceData(newData: any) {

    }
    pushRecomputingStack = () => {

    }
    popRecomputingStack = () => {

    }

    // 给继承者在 apply catch 中用的 工具函数
    manualTrack = (target: object, type: TrackOpTypes, key: unknown) => {
        Notifier.instance.enableTracking()
        // CAUTION，为了方便手动 track 写法，这里会自动 toRaw，这样用户就不需要使用 toRaw 了。
        const dep = Notifier.instance.track(isAtom(target) ? target : toRaw(target), type, key)
        Notifier.instance.resetTracking()
        return dep
    }
    pauseAutoTrack = () => {
        Notifier.instance.pauseTracking()
    }
    autoTrack = () => {
        Notifier.instance.enableTracking()
    }
    resetAutoTrack = () => {
        Notifier.instance.resetTracking()
    }
    collectEffect = ReactiveEffect.collectEffect
    destroyEffect = ReactiveEffect.destroy
}

// export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean): ComputedResult<T>
export function computed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator, forceAtom?: boolean, asyncInitialValue?: any): ComputedData {
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
        Notifier.instance.pauseTracking()
        if (isAtom(this.data)) {
            this.data(newData)
        } else {
            replace(this.data, newData)
        }
        Notifier.instance.resetTracking()
    }

    computedToInternal.set(toRaw(internal.data), internal)
    return internal.data
}

export function atomComputed(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return computed(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, true)
}

computed.as = createDebugWithName(computed)
computed.debug = createDebug(computed)

// 强制重算
export function recompute(computedItem: ComputedData, force = false) {
    const internal = computedToInternal.get(toRaw(computedItem))!
    internal.recompute(force)
}

// 目前 debug 用的
export function isComputed(target: any) {
    return !!computedToInternal.get(toRaw(target))
}

// debug 时用的
export function getComputedGetter(target: any) {
    return computedToInternal.get(toRaw(target))?.getter
}

