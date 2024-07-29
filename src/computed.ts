import {createDebug, createDebugWithName, getDebugName,} from "./debug";
import {Notifier, TriggerInfo} from './notify'
import {reactive, toRaw, toRawObject, UnwrapReactive} from './reactive'
import {isAsync, isGenerator, nextTick, replace, uuid, warn} from "./util";
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
export type AsyncApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => Promise<any>
export type GeneratorApplyPatchType = (computedData: ComputedData, info: TriggerInfo[]) => Generator<any, string, boolean>
export type ApplyPatchType = SimpleApplyPatchType | GeneratorApplyPatchType



export type GetterContext = {
    lastValue: ComputedData,
    onCleanup: (fn: () => any) => void,
    asyncStatus: Atom<null | boolean | string>,
}

export type GetterType = (context: GetterContext) => any
export type GeneratorGetterType = (context: GetterContext) => Generator<any, string, boolean>
export type DirtyCallback = (recompute: (force?: boolean) => void, markDirty: () => any) => void
export type SkipIndicator = { skip: boolean }


export function destroyComputed(computedItem: ComputedData) {
    const internal = computedToInternal.get(toRawObject(computedItem))!
    ReactiveEffect.destroy(internal)
}

export function getComputedInternal(computedItem: ComputedData) {
    return computedToInternal.get(toRawObject(computedItem))
}

const queuedRecomputes = new WeakSet<Computed>()

// 如果是 async 的，用 queueMicrotask 来调度。
// 如果不是 async 的，用 markDirty 而不是直接 recompute
export function scheduleNextMicroTask(this: Computed, recompute: (force?: boolean) => void, markDirty: () => any) {
    if (queuedRecomputes.has(this)) return
    queuedRecomputes.add(this)
    queueMicrotask(() => {
        recompute()
        queuedRecomputes.delete(this)
    })
}


export function scheduleNextTick(this: Computed, recompute: (force?: boolean) => void, markDirty: () => any) {
    if (queuedRecomputes.has(this)) return
    queuedRecomputes.add(this)
    nextTick(() => {
        recompute()
        queuedRecomputes.delete(this)
    })
}

export const STATUS_DIRTY = -1
export const STATUS_RECOMPUTING_DEPS = 1
export const STATUS_RECOMPUTING = 2
export const STATUS_CLEAN = 3

export type StatusType = typeof STATUS_CLEAN | typeof STATUS_DIRTY | typeof STATUS_RECOMPUTING_DEPS | typeof STATUS_RECOMPUTING

export const  FULL_RECOMPUTE_PHASE = 1
export const  PATCH_PHASE = 2
type Phase = typeof FULL_RECOMPUTE_PHASE | typeof PATCH_PHASE

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
    inPatch = false
    phase: Phase  = FULL_RECOMPUTE_PHASE
    runtEffectId?: string
    asyncStatus?: Atom<null | boolean | string>
    status: Atom<StatusType>
    // status: Atom<StatusType> = atom(STATUS_CLEAN)
    triggerInfos: TriggerInfo[] = []
    scheduleRecompute?: DirtyCallback
    // 用来 patch 模式下，收集新增和删除是产生的 effectFrames
    effectFramesArray: ReactiveEffect[][] = []
    keyToEffectFrames: WeakMap<any, ReactiveEffect[]> = new WeakMap()
    manualTracking = false
    public dirtyFromDeps= new Set<Computed>()
    public markedDirtyEffects: Set<Computed> = new Set()
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
    constructor(public getter?: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback|true, public callbacks?: CallbacksType, public skipIndicator?: SkipIndicator, public dataType: ComputedDataType = 'atom') {
        super(getter)
        this.status = atom(typeof getter === 'function' ? STATUS_DIRTY : STATUS_CLEAN)

        // 这是为了支持有的数据结构想写成 source/computed 都支持的情况，比如 RxList。它会继承 Computed
        if (!getter) return


        this.data = this.dataType === 'atom' ?
            atom(null) :
            this.dataType === 'array' ? reactive([]) :
            this.dataType === 'object' ? reactive({}) :
            this.dataType === 'map' ? reactive(new Map()) :
            reactive(new Set())

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
        } else if(this.isAsync && scheduleRecompute !== true) {
            // async 默认用 nextTick 来调度，但是可以通过传递 true 来强制立即执行。
            this.scheduleRecompute = scheduleNextMicroTask
        } else {
            this.immediate = true
        }

        if (callbacks?.onDestroy) this.on('destroy', callbacks.onDestroy)
        if (callbacks?.onTrack) this.on('track', callbacks.onTrack)
        if (callbacks?.onRecompute) this.on('recompute', callbacks.onRecompute)
        if (callbacks?.onCleanup) this.on('cleanup', callbacks.onCleanup)
    }
    public cleanPromise?: Promise<any>
    runEffect() {
        let getterResult

        if (this.isAsync) {
            const runEffectId = uuid()
            this.runtEffectId = runEffectId

            // 说明上一次的还在执行中！，立即设为 false，再重新开始
            if(this.asyncStatus!.raw) {
                this.asyncStatus!(false)
            }
            this.asyncStatus!(true)
            getterResult = this.isGeneratorGetter ? this.callGeneratorGetter(runEffectId) : this.callAsyncGetter()
            getterResult.then((data:any) => {
                if (this.runtEffectId !== runEffectId) return false

                // this.replaceData(data)
                this.asyncStatus!(false)
                return data
            })
        } else {
            getterResult = this.callSimpleGetter()
            // this.replaceData(getterResult)
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
            lastValue: this.data,
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
                this.markedDirtyEffects.add(effect)
            }
        }

        // CAUTION 一定要分成两个循环，因为 effect.run 可能随时会触发 this 重算，使得 status 变为 clean，
        //  如果在下一个 effect 中把 clean 的 dep 添加进去了，就再也清理不了了。
        for(const effect of depEffects) {
            effect.run()
        }

    }
    resolveCleanPromise?: (value?: any) => any
    rejectCleanPromise?: (value?: any) => any
    createCleanPromise() {
        const cleanAll = () => {
            delete this.cleanPromise
            delete this.resolveCleanPromise
            delete this.rejectCleanPromise
        }
        this.cleanPromise = new Promise((res, rej) => {
            this.resolveCleanPromise = (value:any) => {
                res(value)
                cleanAll()
            }
            this.rejectCleanPromise = (value:any) => {
                rej(value)
                cleanAll()
            }
        })
    }
    // dep trigger/recursiveMarkDirty/onTrack 时调用。
    // 1. 没有 infos 和 immediate 说明是 markDirty，是否启动由自己决定
    // 2. 有 infos 说明是 dep trigger，是否启动由自己决定
    // 3. 没有 infos 但有 immediate 是 onTrack 的强制启动，可能是初始化时。
    run(infos: TriggerInfo[] =[], immediate = false) {
        if (this.skipIndicator?.skip) return
        if (infos.length) {
            this.triggerInfos.push(...infos)
        }

        // markDirty, initial 状态不需要 mark dirty
        if (this.status.raw === STATUS_CLEAN) {
            this.dispatch('dirty')
            this.status(STATUS_DIRTY)
        }


        // 哪些情况可能出现 recomputing 过程中又触发了 run :
        // 1. 在 lazy recompute 模式下，可能出现依赖是一个 atomComputed，
        //  触发它的重算时会使得 atom trigger 重新触发 run，这个时候我们已经在 recomputing 了，
        //  只需要获取 info 就行了，不需要再次触发 recompute/schedule 了。
        // 2. 在 async 模式下，任何依赖都可以再触发 recompute。

        if (immediate || this.immediate || this.status.raw > STATUS_DIRTY) {
            if (this.status.raw > STATUS_DIRTY && !this.isAsync) {
                throw new Error('')
                console.warn('detect recompute triggerred in sync recompute, move trigger code to next tick or it may lead to infinite loop')
            }
            this.recompute()
        } else {
            this.scheduleRecompute!(this.recompute, this.recursiveMarkDirty)
        }

        // 如果不是已经开始重算或者立刻开始计算，那么从标记为脏也要创建 cleanPromise
        // 如果在 scheduleRecompute 或者 recompute 已经开始，那么由里面判断是否要建立 cleanPromise
        if (this.status.raw === STATUS_DIRTY && !this.cleanPromise ) {
            this.createCleanPromise()
        }
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

    public recomputeId: number = 0
    async fullRecompute() {
        const recomputeId = ++this.recomputeId
        this.inPatch = false
        // 每次 full recompute 清空所有的 triggerInfos，这样才能使 patchable recompute 不错乱。
        this.triggerInfos.length = 0

        this.prepareRecompute()
        // 默认行为，重算并且重新收集依赖
        // CAUTION 用户一定要自己保证在第一次 await 之前读取了所有依赖。
        let result: any = undefined
        if (this.isAsync) {
            if (!this.cleanPromise) this.createCleanPromise()

            // CAUTION 这里用不用 await 的区别在于，后面的代码会不会放到 next micro task 中执行。
            //  为了防止同步 computed 中最后的 isRecomputing 被放到了 micro task 中，使用户产生困惑（空户可能认为自己写的非 async 就应该同步就计算），所以这里要区分一下。
            result = await this.runEffect()
        } else {
            result = this.runEffect()
        }

        // 在 async fullRecompute 时，是有可能因为 dep 变化触发新的 trigger 的和新的 fullRecompute 的。
        // 这时就会 recomputeId 不一致，老的 recompute 就不用管了。
        if(this.recomputeId !== recomputeId) {
            return
        }


        Notifier.instance.createEffectSession()

        this.replaceData(result)
        this.status(STATUS_CLEAN)

        if (this.applyPatch) {
            this.phase = PATCH_PHASE
        }
        Notifier.instance.digestEffectSession()
        this.resolveCleanPromise?.()
        this.dispatch('clean')

    }
    async patchRecompute() {
        this.inPatch = true
        // patch 也使用 recomputeId 是因为要判断是否被强制 fullRecompute 打断
        const recomputeId = ++this.recomputeId

        this.dispatch('recomputeDeps')

        this.prepareRecompute()

        let patchResult:any
        if (this.isPatchAsync) {
            if (!this.cleanPromise) this.createCleanPromise()

            patchResult = await this.runPatch()
        } else {
            patchResult = this.runPatch()
        }
        // explicit return false 说明出现了无法 patch 的情况，表示一定要重算
        if (patchResult===false) {
            this.triggerInfos.length = 0
            this.inPatch = false
            if (this.isAsync) {
                if (!this.cleanPromise) this.createCleanPromise()

                // CAUTION 这里用不用 await 的区别在于，后面的代码会不会放到 next micro task 中执行。
                //  为了防止同步 computed 中最后的 isRecomputing 被放到了 micro task 中，使用户产生困惑（空户可能认为自己写的非 async 就应该同步就计算），所以这里要区分一下。
                await this.fullRecompute()
            } else {
                this.fullRecompute()
            }
        }
        // 虽然 patch 的 recompute 是串行的，但是有可能被用户强制的 fullRecompute 打断。
        // 这个时候就不用管了。
        if (recomputeId !== this.recomputeId) {
            return
        }


        this.inPatch = false
        this.status(STATUS_CLEAN)
        this.sendTriggerInfos()
        this.dispatch('clean')
        this.resolveCleanPromise?.()
    }
    savedTriggerInfos: Parameters<Notifier["trigger"]>[] = []
    trigger(...args: Parameters<Notifier["trigger"]>) {
        this.savedTriggerInfos.push(args)
    }
    sendTriggerInfos() {
        const infos = [...this.savedTriggerInfos]
        this.savedTriggerInfos.length = 0
        Notifier.instance.createEffectSession()
        for(const info of infos) {
            Notifier.instance.trigger(...info)
        }
        Notifier.instance.digestEffectSession()
    }
    // 由 this.run/onTrack/forceDirtyDepsRecompute 调用
    recompute = async (forceRecompute = false): Promise<any> => {
        if ((this.status.raw === STATUS_CLEAN && !forceRecompute) || !this.active) return

        // 四种类型计算：
        // async/sync * full/patchable

        // 这三种情况需要开启新的 fullRecompute。
        // 1. 外部强制的 recompute
        // 2. full recompute 模式
        // 3. patchable recompute 的 initial 状态
        // 剩下就只有 patchable recompute 的 patch 阶段了

        // 非 async 的计算不会被打断，都是一次性就执行完了。
        // 1. forceRecompute 会打断所有的 async 的计算。
        // 2. async full recompute 自己会打断上一次的
        // 3. async patchable
        // 3.1. 在计算过程中就不需要管了
        // 3.2. 不在就开启新的 patch 计算。

        const needFullRecompute = forceRecompute|| !this.applyPatch || this.phase === FULL_RECOMPUTE_PHASE

        if (needFullRecompute) {
            this.fullRecompute()
        } else {
            if (!this.inPatch) {
                this.patchRecompute()
            }
        }

        return this.cleanPromise
    }
    runPatch() {
        if (this.isAsyncPatch || this.isGeneratorPatch) {
            return this.isAsyncPatch ? this.runAsyncPatch() : this.runGeneratorPatch()
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

    hasDeps() {
        return this.deps.length > 0
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
    destroy(ignoreChildren = false) {
        this.lastCleanupFn?.()
        delete this.lastCleanupFn
        super.destroy( ignoreChildren)
    }
    collectEffect = ReactiveEffect.collectEffect
    destroyEffect = (effect: ReactiveEffect) => {
        // 因为可能是 computed，destroy 和 ReactiveEffect 不一样，所以要调用它自己身的
        effect.destroy()
    }
    cachedValues = new Map<any, any>()
    getCachedValue<T>(effect:any, createFn: () => T) : T{
        let value = this.cachedValues.get(effect)
        if (!value) {
            this.cachedValues.set(effect, value = createFn())
        }
        return value
    }
}

// export function computed<T extends GetterType>(getter: T, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback, callbacks? : CallbacksType) : ComputedResult<T>
export type ComputedDataType = 'atom'|'array'|'object'|'map'|'set'
function internalComputed<T>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator, dataType?: ComputedDataType): T
function internalComputed<T>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator, dataType?: ComputedDataType): T {
    const internal = new Computed(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, dataType)

    internal.replaceData = function(newData: any) {
        Notifier.instance.pauseTracking()
        if (isAtom(this.data)) {
            this.data(newData)
        } else {
            replace(this.data, newData)
        }
        Notifier.instance.resetTracking()
    }

    internal.run([], true)

    computedToInternal.set(toRawObject(internal.data), internal)
    return internal.data
}


export function computed<T>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return internalComputed<Atom<T>>(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, 'atom')
}

export function arrayComputed<T>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return internalComputed<UnwrapReactive<T[]>>(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, 'array')
}
export function objectComputed<T>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return internalComputed<UnwrapReactive<T>>(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, 'object')
}
export function mapComputed<K, V>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return internalComputed<UnwrapReactive<Map<K, V>>>(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, 'map')
}
export function setComputed<T>(getter: GetterType, applyPatch?: ApplyPatchType, dirtyCallback?: DirtyCallback|true, callbacks?: CallbacksType, skipIndicator?: SkipIndicator) {
    return internalComputed<UnwrapReactive<Set<T>>>(getter, applyPatch, dirtyCallback, callbacks, skipIndicator, 'set')
}

internalComputed.as = createDebugWithName(internalComputed)
internalComputed.debug = createDebug(internalComputed)

// 强制重算
export function recompute(computedItem: ComputedData, force = false) {
    const internal = computedToInternal.get(toRawObject(computedItem))!
    internal.recompute(force)
}

// 目前 debug 用的
export function isComputed(target: any) {
    return !!computedToInternal.get(toRawObject(target))
}

// debug 时用的
export function getComputedGetter(target: any) {
    return computedToInternal.get(toRawObject(target))?.getter
}

