import {
    ApplyPatchType,
    CallbacksType,
    computed,
    Computed,
    destroyComputed,
    DirtyCallback,
    GetterType
} from "./computed.js";
import {Atom, atom, isAtom} from "./atom.js";
import {Dep} from "./dep.js";
import {InputTriggerInfo, ITERATE_KEY, Notifier, TriggerInfo} from "./notify.js";
import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
import {assert} from "./util.js";
import {ReactiveEffect} from "./reactiveEffect.js";
import {RxMap} from "./RxMap.js";
import {RxSet} from "./RxSet";
import {autorun} from "./common";

type MapOptions<U> = {
    beforePatch?: (triggerInfo: InputTriggerInfo) => any,
    scheduleRecompute?: DirtyCallback,
    ignoreIndex?: boolean,
    onCleanup?: (item: U) => any
}

type MapCleanupFn = () => any

type MapContext = {
    onCleanup: (fn: MapCleanupFn) => void
}

export class RxList<T> extends Computed {
    data!: T[]
    trackClassInstance = true
    indexKeyDeps = new Map<number, Dep>()
    atomIndexes? :Atom<number>[]
    atomIndexesDepCount = 0

    constructor(sourceOrGetter: T[]|null|GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType) {
        const getter = typeof sourceOrGetter === 'function' ? sourceOrGetter : undefined
        const source = typeof sourceOrGetter !== 'function' ? sourceOrGetter : undefined

        // 自己可能是 computed，也可能是最初的 reactive
        super(getter, applyPatch, scheduleRecompute, callbacks, undefined, undefined)
        this.getter = getter

        // 自己是 source
        this.data = source || []
        if (this.getter) {
            this.run([], true)
        }
        this.createComputedMetas()
    }
    replaceData(newData: T[]) {
        this.splice(0, this.data.length, ...newData)
    }

    push(...items: T[]) {
        return this.splice(this.data.length, 0, ...items)
    }
    pop( ) {
        return this.splice(this.data.length - 1, 1)[0]
    }
    shift( ) {
        return this.splice(0, 1)[0]
    }
    unshift( ...items: T[]) {
        return this.splice(0, 0, ...items)
    }
    splice( start: number, deleteCount: number, ...items: T[]) {
        this.pauseAutoTrack()
        // Notifier.instance.createEffectSession()

        const originLength = this.data.length
        const deleteItemsCount = Math.min(deleteCount, originLength - start)


        // CAUTION 不需要触发 length 的变化，因为获取  length 的时候得到就已经是个 computed 了。
        const newLength = originLength - deleteItemsCount + items.length
        const changedIndexEnd = deleteItemsCount !== items.length ? newLength : start + items.length
        const oldValues = []
        for (let i = start; i < changedIndexEnd; i++) {
            oldValues[i] = this.data[i]
        }
        const result = this.data.splice(start, deleteCount, ...items)


        // CAUTION 无论有没有 indexKeyDeps 都要触发 Iterator_Key，
        //  特别这里注意，我们利用传了 key 就会把对应 key 的 dep 拿出来的特性来 trigger ITERATE_KEY.
        //  CAUTION 一定先 trigger method，这样可能后面某些被删除的 atomIndexes 变化就不需要了。
        this.trigger(this, TriggerOpTypes.METHOD, { method:'splice', key: ITERATE_KEY, argv: [start, deleteCount, ...items], methodResult: result })
        // 只有当有 indexKeyDeps 的时候才需要手动查找 dep 和触发，这样效率更高
        if (this.indexKeyDeps?.size > 0){
            for (let i = start; i < changedIndexEnd; i++) {
                this.trigger(this, TriggerOpTypes.SET, { key: i, newValue: this.data[i], oldValue: oldValues[i]})
            }
        }

        // CATION 特别注意这里 atomIndexes 的变化也要先 catch 住
        Notifier.instance.createEffectSession()
        this.sendTriggerInfos()

        if (this.atomIndexes) {
            this.atomIndexes.splice(start, deleteCount, ...items.map((_, index) => atom(index + start)))
            for (let i = start; i <changedIndexEnd; i++) {
                // 注意这里的 ?. ，因为 splice 之后可能长度不够了。
                this.atomIndexes[i]?.(i)
            }
        }
        Notifier.instance.digestEffectSession()

        this.resetAutoTrack()
        return result
    }
    // 显式 set 某一个 index 的值
    set(index: number, value: T) {
        const oldValue = this.data[index]
        this.data[index] = value

        // 这里还是用 trigger TriggerOpTypes.SET，因为系统在处理 TriggerOpTypes.SET 的时候还会对 listLike 的数据 触发 ITERATE_KEY。
        if (index > this.data.length - 1) {
            this.trigger(this, TriggerOpTypes.ADD, { key: index, newValue: value, oldValue})
        } else {
            this.trigger(this, TriggerOpTypes.SET, { key: index, newValue: value, oldValue})
        }
        this.trigger(this, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { key: index, newValue: value, oldValue, methodResult: oldValue})
        this.sendTriggerInfos()

        return oldValue
    }

    // CAUTION 这里手动 track index dep 的变化，是为了在 splice 的时候能手动去根据订阅的 index dep 触发，而不是直接触发所有的 index key。
    at(index: number): T|undefined{
        const dep = Notifier.instance.track(this, TrackOpTypes.GET, index)
        if (dep && !this.indexKeyDeps.has(index)) {
            this.indexKeyDeps.set(index, dep)
        }
        // CAUTION 这里不做深度的 reactive 包装
        return this.data[index]
    }

    forEach(handler: (item: T, index: number) => void) {
        for (let i = 0; i < this.data.length; i++) {
            // 转发到 at 上实现 track
            handler(this.at(i)!, i)
        }
        // track length
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
    }
    [Symbol.iterator]() {
        let index = 0;
        let data = this.data;
        // track length
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
        return {
            next: () => {
                if (index < data.length) {
                    // 转发到 at 上实现 track index
                    const value = this.at(index)
                    return { value, done: false };
                } else {
                    return { done: true };
                }
            }
        };
    }
    addAtomIndexesDep() {
        if (this.atomIndexesDepCount === 0) {
            this.atomIndexes = this.data.map((_, index) => atom(index))
        }
        this.atomIndexesDepCount++
    }
    removeAtomIndexesDep() {
        this.atomIndexesDepCount--
        if (this.atomIndexesDepCount === 0) {
            this.atomIndexes = undefined
        }
    }

    // reactive methods and attr
    map<U>(mapFn: (item: T, index: Atom<number>, context:MapContext) => U, options?: MapOptions<U>) : RxList<U>{
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)

        const source = this
        const useIndex = mapFn.length>1 && !options?.ignoreIndex
        const useContext = mapFn.length>2
        if(useIndex) {
            source.addAtomIndexesDep()
        }

        let addedAtomIndexesDep = useIndex

        // CAUTION cleanupFns 是用户自己用 context.onCleanup 收集的，因为可能用到 mapFn 中的局部变量
        //  如果可以直接从 mapFn return value 中来销毁副作用，那么应该使用 options.onCleanup 来注册一个统一的销毁函数，这样能提升性能，不需要建立 cleanupFns 数组。
        let cleanupFns: MapCleanupFn[]|undefined

        return new RxList(
            function computation(this: RxList<U>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                cleanupFns = useContext ? [] : undefined

                const result: U[] = []
                source.data.forEach((_, i) => {
                    // const getFrame = ReactiveEffect.collectEffect!()
                    const mapContext: MapContext|undefined = useContext ? {
                        onCleanup(fn: MapCleanupFn) {
                            cleanupFns![i] = fn
                        }
                    } : undefined

                    let newItemIndex: Atom<number>|undefined
                    const newItemRun = new Computed(() => {
                        // CAUTION 特别注意这里面的变量，我们只希望  track 用户 mapFn 里面用到的外部  reactive 对象，不希望 track 到自己的 key/index。
                        if(newItemIndex) {
                            this.set(newItemIndex.raw, mapFn(source.data[newItemIndex.raw], newItemIndex!, mapContext!))
                        } else {
                            result[i] = mapFn(source.data[i], source.atomIndexes?.[i]!, mapContext!)
                        }
                    }, undefined, true)

                    newItemRun.run()

                    if (newItemRun.hasDeps()) {
                        if (!addedAtomIndexesDep) {
                            source.addAtomIndexesDep()
                            addedAtomIndexesDep = true
                        }
                        newItemIndex = source.atomIndexes![i]!
                    }
                    this.effectFramesArray![i] = [newItemRun] as ReactiveEffect[]

                })

                return result
            },
            function applyMapArrayPatch(this: RxList<U>, _data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {

                    const { method , argv  ,key } = triggerInfo
                    assert((method === 'splice' || key !== undefined), 'trigger info has no method and key')
                    assert(triggerInfo.source === source, 'unexpected triggerInfo source')

                    options?.beforePatch?.(triggerInfo)

                    if (method === 'splice') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newItemsInArgs = argv!.slice(2)
                        const effectFrames: ReactiveEffect[][] = []
                        const newCleanups: MapCleanupFn[] = []
                        const newItems = newItemsInArgs.map((_, index) => {
                            const mapContext: MapContext|undefined = useContext ? {
                                onCleanup(fn: MapCleanupFn) {
                                    newCleanups![index] = fn
                                }
                            } : undefined
                            let newItem: U
                            const newIndex = index + argv![0]!
                            let newItemIndex: Atom<number>|undefined

                            const newItemRun = new Computed(() => {
                                // 说明是内部有依赖变换发生的更新。
                                if (newItemIndex) {
                                    this.set(newItemIndex.raw, mapFn(source.data[index+ argv![0]]!, newItemIndex, mapContext!))
                                } else {
                                    newItem = mapFn(source.data[index+ argv![0]]!, source.atomIndexes?.[newIndex]!, mapContext!)
                                }
                            }, undefined, true)
                            newItemRun.run()

                            if (newItemRun.hasDeps()) {
                                if (!addedAtomIndexesDep) {
                                    source.addAtomIndexesDep()
                                    addedAtomIndexesDep = true
                                }
                                newItemIndex = source.atomIndexes![newIndex]!
                            }
                            effectFrames![index] = [newItemRun] as ReactiveEffect[]
                            return newItem!
                        })
                        const deletedItems = this.splice(argv![0], argv![1], ...newItems)
                        const deletedFrames = this.effectFramesArray!.splice(argv![0], argv![1], ...effectFrames)
                        deletedFrames.forEach((frame) => {
                            frame.forEach((effect) => {
                                this.destroyEffect(effect)
                            })
                        })
                        // 更新和执行 cleanupFns
                        if (useContext && cleanupFns?.length) {
                            // CAUTION 这里要把删除的 effect 的 cleanup 都执行一遍
                            //  如果能从 return value 中进行销毁，应该使用 options.onCleanup 来注册一个统一的销毁函数，这样能提升性能。
                            const deletedCleanupFns = cleanupFns.splice(argv![0], argv![1], ...newCleanups)
                            deletedCleanupFns.forEach((fn) => {
                                fn?.()
                            })
                        }
                        // 统一的销毁函数
                        if(options?.onCleanup) {
                            deletedItems.forEach((item) => {
                                options.onCleanup!(item)
                            })
                        }
                    } else {
                        // explicit key change
                        // CAUTION add/update 一定都要全部重新从 source 里面取，因为这样才能得到正确的 proxy。newValue 是 raw data，和 mapFn 里面预期拿到的不一致。
                        // 没有 method 说明是 explicit_key_change 变化
                        const index = key as number
                        const getFrame = this.collectEffect()
                        const mapContext: MapContext|undefined = useContext ? {
                            onCleanup(fn: MapCleanupFn) {
                                cleanupFns![index] = fn
                            }
                        } : undefined
                        const oldItem = this.data.at(index)!
                        const oldCleanupFn = cleanupFns?.[index]

                        this.set(index, mapFn(source.at(index)!, source.atomIndexes?.[index]!, mapContext!))
                        const newFrame = getFrame() as ReactiveEffect[]
                        this.effectFramesArray![index]?.forEach((effect) => {
                            this.destroyEffect(effect)
                        })
                        this.effectFramesArray![index] = newFrame

                        if (oldCleanupFn) {
                            oldCleanupFn()
                        }
                        if(options?.onCleanup) {
                            options.onCleanup(oldItem)
                        }

                    }
                })
            },
            options?.scheduleRecompute,
            {
                onDestroy(this: RxList<U>)  {
                    if (addedAtomIndexesDep) {
                        source.removeAtomIndexesDep()
                    }
                    if (cleanupFns) {
                        cleanupFns.forEach((fn) => {
                            fn()
                        })
                    }
                    if(options?.onCleanup) {
                        this.data.forEach((item) => {
                            options.onCleanup!(item)
                        })
                    }
                }
            },
        )
    }
    // 另一种 map
    reduce<U>(reduceFn: (last: RxList<U>, item: T, index: number) => any): RxList<U> {
        const source = this
        return new RxList(
            function computation(this: RxList<U>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                this.data =[]
                for(let i = 0; i < source.data.length; i++) {
                    const getFrame = ReactiveEffect.collectEffect!()
                    reduceFn(this, source.data[i], i)
                    this.effectFramesArray![i] = getFrame() as ReactiveEffect[]
                }
                return this.data
            },
            function applyMapArrayPatch(this: RxList<U>, _data, triggerInfos) {
                const shouldRecompute = triggerInfos.some((triggerInfo) => {
                    const { method , argv   } = triggerInfo
                    return !(method === 'splice' && argv![0] === source.data.length - argv!.slice(2).length && argv![1] === 0)
                })

                if(shouldRecompute) return false

                triggerInfos.forEach((triggerInfo) => {
                    const { argv   } = triggerInfo
                    const originLength = this.data.length
                    // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                    const newItemsInArgs = argv!.slice(2)
                    for(let i = 0; i < newItemsInArgs.length; i++) {
                        const getFrame = ReactiveEffect.collectEffect!()
                        reduceFn(this, newItemsInArgs[i], i + originLength)
                        this.effectFramesArray![i] = getFrame() as ReactiveEffect[]
                    }
                })
            }
        )
    }

    find(matchFn:(item: T) => boolean): Atom<T> {
        const index = this.findIndex(matchFn)

        return computed(() => {
            const indexValue = index()
            return indexValue === -1 ? undefined : this.at(indexValue)
        }, undefined, true, {
            onDestroy() {
                destroyComputed(index)
            }
        })
    }
    findIndex(matchFn:(item: T) => boolean): Atom<number> {
        const source = this
        // CAUTION 特别注意，这里不要对 autorunDisposes 做中间的部分的 splice，那样 autorun 里面的 index 就不对了。
        //  始终只当成队列来使用。
        let autorunDisposes: Array<()=>any> = []
        let result: Atom<number>|undefined

        function createAutorun(index:number) {
            let found = false
            const dispose = autorun(() => {
                // CAUTION 第一次在 computation 调用的时候 result 还没有 initialize，所以只能在这里要用的时候才读。
                const data = result
                if (matchFn(source.data[index]!)) {
                    found = true

                    // 新的 index，肯定是更小的，因为我们只对前面的做了 autorun
                    if (data?.raw !== index) {
                        data?.(index)
                        const disposes = autorunDisposes.splice(index+1, Infinity)
                        disposes.forEach(dispose => dispose())
                    }
                } else {
                    // 刚好是匹配的这个变化成不匹配了

                    if (data && data.raw === index) {
                        // 继续往后找吧
                        data(searchAndRegisterDispose(index + 1, Infinity))
                    }
                }
            }, true)
            return {
                found,
                dispose
            }
        }

        function searchAndRegisterDispose(startIndex: number, limit=Infinity) {
            const disposes = autorunDisposes.splice(startIndex, limit)
            disposes.forEach(dispose => dispose())

            for(let i = startIndex; i < Math.min(startIndex + limit, source.data.length); i++) {
                const {found, dispose} = createAutorun(i)
                autorunDisposes.push(dispose)
                if (found) {
                    return i
                }
            }

            return -1
        }

        function checkOne(index: number) {
            autorunDisposes[index] = createAutorun(index).dispose
        }


        result = computed<number>(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE)
                return searchAndRegisterDispose(0, Infinity)
            },
            function applyPatch(this: Computed, data: Atom<T>, triggerInfos){
                debugger

                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key } = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    let startFindingIndex = Infinity
                    if (method === 'splice') {
                        const startIndex = argv![0] as number
                        // 可能新增了更小的能找到的，都从 startIndex 开始重新算。
                        if (this.data.raw == -1 || startIndex <= this.data.raw) {
                            startFindingIndex = startIndex
                        }

                    } else {
                        // explicit key change
                        if (this.data.raw === key) {
                            // 刚好把找到的弄没了
                            startFindingIndex = key as number
                        } else if((key as number) < this.data.raw) {
                            // 快速验证 这一个是不是新的 match，如果是就替换，index 变小，如果不是就没影响。
                            checkOne(key as number)
                        }
                    }

                    // 需要重找
                    if (startFindingIndex !== Infinity) {
                        data(searchAndRegisterDispose(startFindingIndex, Infinity))
                    }
                })
            },
            true,
            {
                onDestroy() {
                    autorunDisposes.forEach(dispose => dispose())
                    autorunDisposes = []
                }
            }
        )

        return result!
    }

    filter(filterFn: (item:T) => boolean): RxList<T> {
        const filtered = new RxList<T>([])
        const mapList = this.map((item, _, {onCleanup}) => {
            const remove = () => {
                const index =  filtered.data.indexOf(item)
                if (index !== -1) {
                    filtered.splice(index, 1)
                }
            }

            return computed(({lastValue} ) => {
                const matched = filterFn(item)
                if (matched) {
                    if (!lastValue.raw) filtered.push(item)
                } else {
                    // 第一次没匹配上不需要执行 remove，节省一下性能。
                    if (lastValue.raw === true) remove()
                }
                return matched
            }, undefined, true, {
                onDestroy() {
                    remove()
                }
            })
        }, { ignoreIndex: true})

        filtered.on('destroy', () => mapList.destroy())

        return filtered
    }
    every(fn: (item:T) => boolean): Atom<boolean> {
        const some = this.some((item) => !fn(item))
        return computed(() => {
            return !some()
        }, undefined, true, {
            onDestroy() {
                destroyComputed(some)
            }
        })
    }
    some(fn: (item:T) => boolean) : Atom<boolean>{
        const index = this.findIndex(fn)
        return computed(() => {
            return index() != -1
        }, undefined, true, {
            onDestroy() {
                destroyComputed(index)
            }
        })
    }
    groupBy<K>(getKey: (item: T) => K) {
        const source = this
        return new RxMap<K, RxList<T>>(
            function computation(this: RxMap<any, RxList<T>>) {
                const groups = new Map()
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                for (let i = 0; i < source.data.length; i++) {
                    const item = source.data[i]
                    const key = getKey(item)
                    if (!groups.has(key)) {
                        groups.set(key, new RxList([]))
                    }
                    groups.get(key)!.push(item)
                }
                return groups
            },
            function applyPatch(this: RxMap<any, RxList<T>>, _data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, newValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (method === 'splice') {
                        const deleteItems = methodResult as T[] || []
                        deleteItems.forEach((item) => {
                            const groupKey = getKey(item)
                            if (this.data.has(groupKey)) {
                                this.data.get(groupKey)!.splice(this.data.get(groupKey)!.data.indexOf(item), 1)
                            }
                        })
                        const newItemsInArgs = argv!.slice(2)
                        newItemsInArgs.forEach((item) => {
                            const groupKey = getKey(item)
                            if (!this.data.has(groupKey)) {
                                this.set(groupKey, new RxList([]))
                            }
                            this.data.get(groupKey)!.push(item)
                        })
                    } else {
                        // explicit key change
                        if (oldValue) {
                            const oldGroupKey = getKey(oldValue as T)
                            this.data.get(oldGroupKey)!.splice(this.data.get(oldGroupKey)!.data.indexOf(oldValue as T), 1)
                        }

                        const newGroupKey = getKey(newValue as T)
                        if (!this.data.has(newGroupKey)) {
                            this.set(newGroupKey, new RxList([]))
                        }
                        this.data.get(newGroupKey)!.push(newValue as T)
                    }
                })
            }
        )
    }

    indexBy(inputIndexKey: keyof T|((item: T) => any)) {
        const source = this
        return new RxMap<any, T>(
            function computation(this: RxMap<any, T>) {
                const map = new Map()
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                for (let i = 0; i < source.data.length; i++) {
                    const item = source.data[i]
                    const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(item) : item[inputIndexKey]
                    assert(!map.has(indexKey), 'indexBy key is already exist')
                    map.set(indexKey, item)
                }
                return map
            },
            function applyPatch(this: RxMap<any, T>, _data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, newValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (method === 'splice') {
                        const deleteItems = methodResult as T[] || []
                        deleteItems.forEach((item) => {
                            const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(item) : item[inputIndexKey]
                            this.delete(indexKey)
                        })
                        const newItemsInArgs = argv!.slice(2)
                        newItemsInArgs.forEach((item) => {
                            const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(item) : item[inputIndexKey]

                            assert(!this.data.has(indexKey), 'indexBy key is already exist')
                            this.set(indexKey, item)
                        })
                    } else {
                        // explicit key change
                        const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(oldValue as T) : (oldValue as T)[inputIndexKey]
                        this.delete(indexKey)
                        const newKey = typeof inputIndexKey === 'function' ? inputIndexKey(newValue as T) : (newValue as T)[inputIndexKey]
                        this.set(newKey, newValue as T)
                    }
                })
            }
        )
    }
    toArray() {
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
        return this.data
    }
    toMap() {
        const source = this
        return new RxMap<T extends [any, any] ? T[0] : any, T extends [any, any] ? T[1] : any>(
            function computation(this: RxMap<any, T>) {
                const map = new Map()
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                for (let i = 0; i < source.data.length; i++) {
                    const [key, value] = source.data[i] as [any, any]
                    assert(!map.has(key), 'indexBy key is already exist')
                    map.set(key, value)
                }
                return map
            },
            function applyPatch(this: RxMap<any, T>, _data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, newValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (method === 'splice') {
                        const deleteItems = methodResult as [any, any][] || []
                        deleteItems.forEach(([indexKey]) => {
                            this.delete(indexKey)
                        })
                        const newItemsInArgs = argv!.slice(2) as [any, any][]
                        newItemsInArgs.forEach(([indexKey, value]) => {
                            this.set(indexKey, value)
                        })
                    } else {
                        // explicit key change
                        const indexKey = (oldValue as [any, any])[0]
                        this.delete(indexKey)
                        const [newKey, newItem] = newValue as [any, any]
                        this.set(newKey, newItem)
                    }
                })
            }
        )
    }
    toSet(): RxSet<T> {
        const base = this
        return new RxSet<T>(
            function computation(this: RxSet<T>) {
                this.manualTrack(base, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(base, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return new Set(base.data)
            },
            function applyPatch(this: RxSet<T>, _data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, newValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (method === 'splice') {
                        const deleteItems = methodResult as T[] || []
                        deleteItems.forEach((item) => {
                            this.delete(item)
                        })
                        const newItemsInArgs = argv!.slice(2)
                        newItemsInArgs.forEach((item) => {
                            this.add(item)
                        })
                    } else {
                        // explicit key change
                        this.delete(oldValue as T)
                        this.add(newValue as T)
                    }
                })
            }
        )
    }
    public length!: Atom<number>
    createComputedMetas( ) {
        // FIXME 目前不能用 cache 的方法在读时才创建。
        //  因为如果是在 autorun 等  computed 中读的，会导致在cleanup 时把
        //  相应的 computed 当做 children destroy 掉。
        const source = this
        this.length = computed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return source.data!.length
            },
            function applyPatch(this: Computed, data: Atom<number>){
                data(source.data.length)
            }
        )
    }


    // FIXME onUntrack 的时候要把 indexKeyDeps 里面的 dep 都删掉。因为 Effect 没管这种情况。
    onUntrack(_effect: ReactiveEffect) {

    }
    destroy() {
        super.destroy()
        this.indexKeyDeps.clear()
        this.atomIndexes = undefined
    }

    createSelection(currentValues: RxSet<T|number>|Atom<T|null|number>, autoResetValue?: boolean) {
        return createSelection(this, currentValues, autoResetValue)
    }
    createIndexKeySelection(currentValues: RxSet<number>|Atom<null|number>, autoResetValue?:boolean) {
        return createIndexKeySelection(this, currentValues, autoResetValue)
    }
}


export function createSelection<T>(source: RxList<T>, currentValues: RxSet<T|number>|Atom<T|null|number>, autoResetValue = false): RxList<[T, Atom<boolean>]> {
    function trackCurrentValues(list: Computed) {
        if (isAtom(currentValues)) {
            list.manualTrack(currentValues, TrackOpTypes.ATOM, 'value');
        } else {
            list.manualTrack(currentValues, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
        }
    }

    function trackIndicators(list: Computed) {
        list.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
        list.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
    }

    const itemToIndicator: Map<any, Atom<boolean>> = new Map()

    function createNewIndicator(item:T) {
        const indicator = atom(isAtom(currentValues) ? currentValues.raw === item : currentValues.data.has(item))
        itemToIndicator.set(item, indicator)
        return indicator
    }

    function deleteCurrentValueIfItemRemoved(item:T) {
        if (isAtom(currentValues)) {
            if (item === currentValues.raw) {
                currentValues(null)
            }
        } else {
            if(currentValues.data.has(item)) {
                currentValues.delete(item)
            }
        }
    }

    function updateIndicatorsFromSourceChange(list: RxList<[T, Atom<boolean>]>, triggerInfo: TriggerInfo) {
        if (triggerInfo.method === 'splice') {
            const { methodResult , argv } = triggerInfo
            const newItemsInArgs = argv!.slice(2)
            const deleteItems: T[] = methodResult || []
            list.splice(argv![0], argv![1], ...newItemsInArgs.map((item) => [item, createNewIndicator(item)] as [T, Atom<boolean>]))
            deleteItems.forEach((item) => {
                itemToIndicator.delete(item)
            })
        } else {
            //explicit key change
            const {  newValue, key } = triggerInfo
            list.set(key as number, [newValue as T, createNewIndicator(newValue as T)] as [T, Atom<boolean>])
        }
    }


    function updateIndicatorsFromCurrentValueChange(triggerInfo: TriggerInfo) {
        const { oldValue, newValue, method } = triggerInfo
        if(isAtom(currentValues)) {
            itemToIndicator.get(oldValue as T)?.(false)
            itemToIndicator.get(newValue as T)?.(true)
        } else {
            // RxSet，有 add/delete/replace method
            let newItems: T[] = []
            let deletedItems: T[] = []
            if (method === 'add') {
                newItems = [triggerInfo.argv![0] as T]
            } else if (method === 'delete') {
                deletedItems = [triggerInfo.argv![0] as T]
            } else {
                [newItems, deletedItems] = triggerInfo.methodResult as [T[], T[]]
            }
            newItems.forEach((item) => {
                const indicator = itemToIndicator?.get(item)
                indicator?.(true)
            })
            deletedItems.forEach((item) => {
                const indicator = itemToIndicator?.get(item)
                indicator?.(false)
            })
        }
    }

    const stopAutoResetValue = autoResetValue ?
        new Computed(
            function(this: Computed){
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
            },
            function(_, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method } = triggerInfo
                    assert(method === 'splice', 'currentValues can only support splice')
                    const deleteItems = triggerInfo.methodResult
                    deleteItems.forEach((item:T) => {
                        deleteCurrentValueIfItemRemoved(item)
                    })
                })
            },
            true
        ) :
        undefined

    stopAutoResetValue?.run()

    return new RxList(
        function computation(this:Computed ) {
            // 监听 source 的变化，需要动态增加 indicators
            trackIndicators(this)
            // track currentValues 的变化
            trackCurrentValues(this)

            return source.data.map((item) => [item, createNewIndicator(item)])
        },
        function applyPatch(this: RxList<[T, Atom<boolean>]>, _data, triggerInfos: TriggerInfo[]) {
            triggerInfos.forEach((triggerInfo) => {
                if (triggerInfo.source === source) {
                    // 来自 source 的变化，需要同步 indicators
                    updateIndicatorsFromSourceChange(this, triggerInfo)
                } else {
                    // 来自 currentValues 的变化，需要同步 indicators
                    updateIndicatorsFromCurrentValueChange(triggerInfo)
                }
            })
        },
        undefined,
        {
            onDestroy() {
                stopAutoResetValue?.destroy()
            }
        }
    )

}


export function createIndexKeySelection<T>(source: RxList<T>, currentValues: RxSet<number>|Atom<null|number>, autoResetValue = false): RxList<[T, Atom<boolean>]> {

    function trackCurrentValues(list: Computed) {
        if (isAtom(currentValues)) {
            list.manualTrack(currentValues, TrackOpTypes.ATOM, 'value');
        } else {
            list.manualTrack(currentValues, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
        }
    }

    function trackIndicators(list: Computed) {
        list.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
    }


    function updateIndicatorsFromSourceChange(list: RxList<[T, Atom<boolean>]>, triggerInfo: TriggerInfo) {
        if (triggerInfo.method === 'splice') {
            const {  argv } = triggerInfo
            const newItemsInArgs = argv!.slice(2)
            list.splice(argv![0], argv![1], ...newItemsInArgs.map((item) => [item, createNewIndicator(item)] as [T, Atom<boolean>]))

            const deleteCount = argv![1]
            const insertCount = newItemsInArgs.length

            if (deleteCount !== insertCount) {
                const startIndex = argv![0] as number

                const selectedValues = isAtom(currentValues) ? (currentValues.raw ? [currentValues.raw] : []) : [...currentValues.data]
                // 因为 index 产生了变化，所以要更新 indicator
                selectedValues.forEach((value) => {
                    const index = value as number
                    if (index < list.data.length ) {
                        // 只有 index 在后面的才是还存在，并且受了影响需要处理的。
                        if (index >= startIndex && deleteCount !== insertCount) {
                            const indexAfterChange = index + insertCount - deleteCount
                            const oldIndexIndicator = list.data.at(indexAfterChange)![1]
                            oldIndexIndicator(false)
                        }
                        const newIndicator = list.data.at(index)![1]
                        newIndicator?.(true)
                    }
                })
            }
        }
        // 不需要处理 explicit key change
    }

    function updateIndicatorsFromCurrentValueChange(list: RxList<[T,  Atom<boolean>]>,triggerInfo: TriggerInfo) {
        const { oldValue, newValue, method } = triggerInfo

        if(isAtom(currentValues)) {
            list.data[oldValue as number]?.[1](false)
            list.data[newValue as number]?.[1](true)
        } else {
            // RxSet，有 add/delete/replace method
            let deleteItems: number[] = []
            let insertItems: number[] = []
            if (method === 'add') {
                insertItems = [triggerInfo.argv![0] as number]
            } else if (method === 'delete') {
                deleteItems = [triggerInfo.argv![0] as number]
            } else {
                [deleteItems, insertItems] = triggerInfo.methodResult as [number[], number[]]
            }


            (deleteItems as number[]).forEach((item) => {
                list.data[item][1](false)
            })
            insertItems.forEach((item:number) => {
                list.data[item][1](true)
            })
        }
    }

    function createNewIndicator(index: number) {
        return atom(isAtom(currentValues) ? currentValues.raw === index : currentValues.data.has(index))
    }

    const autoResetValueEffect = autoResetValue ?
        new Computed(
            function(this: Computed){
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
            },
            function(_, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method } = triggerInfo
                    assert(method === 'splice', 'currentValues can only support splice')
                    const newLength = source.data.length
                    if (isAtom(currentValues)) {
                        if (currentValues.raw && currentValues.raw >= newLength) {
                            currentValues(null)
                        }
                    } else {
                        // RxSet
                        currentValues.data.forEach((item) => {
                            if (item >= newLength) {
                                currentValues.delete(item)
                            }
                        })
                    }
                })
            },
            true
        ) :
        undefined

    return new RxList<[T, Atom<boolean>]>(
        function  computation(this: Computed) {
            trackCurrentValues(this)
            trackIndicators(this)

            return source.data.map((item, key) => [item, createNewIndicator(key)])
        },
        function applyPatch(this: RxList<[T, Atom<boolean>]>, _data, triggerInfos: TriggerInfo[]) {
            triggerInfos.forEach((triggerInfo) => {
                if (triggerInfo.source === source) {
                    // 来自 source 的变化，需要同步 indicators
                    updateIndicatorsFromSourceChange(this, triggerInfo)
                } else {
                    updateIndicatorsFromCurrentValueChange(this, triggerInfo)
                }
            })
        },
        undefined,
        {
            onDestroy() {
                autoResetValueEffect?.destroy()
            }
        }
    )

}

