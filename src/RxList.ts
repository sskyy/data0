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

type Order = [number, number]

export class RxList<T> extends Computed {
    get raw() { return this.data }
    data!: T[]
    trackClassInstance = true
    indexKeyDeps = new Map<number, Dep>()
    atomIndexes? :Atom<number>[]
    atomIndexesDepCount = 0

    constructor(sourceOrGetter?: T[]|null|GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType) {
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
    // 这里的 newData type 为 any[]，是为了让子类能覆写，实现 replaceData 的时候才进行数据转换。
    replaceData(newData: any[]) {
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
    reorder(newOrder: Order[]) {
        const originIndexes = newOrder.map(item => item[0])
        const newIndexes = newOrder.map(item => item[1])
        const oldIndexAtoms = this.atomIndexes ? originIndexes.map(index => this.atomIndexes![index]) : null
        // 要不要触发 set 语义呢？理论上是需要的
        const originItems = originIndexes.map(index => this.data[index])
        const originItemsInNewIndexes = newIndexes.map(index => this.data[index])
        newIndexes.forEach((newIndex, i) => {
            this.data[newIndex]= originItems[i]
            if (this.indexKeyDeps?.size) {
                this.trigger(this, TriggerOpTypes.SET, { key: newIndex, newValue: originItems[i], oldValue: originItemsInNewIndexes[i]})
            }
            if (oldIndexAtoms) {
                oldIndexAtoms[i]?.(newIndex)
                this.atomIndexes![newIndex] = oldIndexAtoms[i]!
            }
        })

        this.trigger(this, TriggerOpTypes.METHOD, { method:'reorder', key: ITERATE_KEY, argv: [newOrder] })
    }
    reposition(start:number, newStart:number, limit:number = 1 ) {
        assert(start >= 0 && start+limit < this.data.length, 'start index out of range')
        assert(newStart >= 0 && newStart+limit < this.data.length, 'newStart index out of range')
        // 1. 如果是往前移动，新位置到原来为止中间的元素都要往后移动
        // 2. 如果是往后移动，原来位置到新位置为止中间的元素都要往前移动
        if (start === newStart) return
        const newOrder:Order[] = []
        for (let i = 0; i < limit; i++) {
            newOrder.push([start + i, newStart + i])
        }

        // 往前
        if (newStart < start) {
            for(let i = newStart; i < start; i++) {
                newOrder.push([i, i + limit])
            }
        } else {
            // 往后
            for(let i = start + limit; i < newStart+limit; i++) {
                newOrder.push([i, i - limit])
            }
        }
        return this.reorder(newOrder)
    }
    swap(start: number, newStart:number, limit:number = 1) {
        assert(start >= 0 && start+limit < this.data.length, 'start index out of range')
        assert(newStart >= 0 && newStart+limit < this.data.length, 'newStart index out of range')
        const newOrder:Order[] = []
        for (let i = 0; i < limit; i++) {
            newOrder.push([start + i, newStart + i])
            newOrder.push([newStart + i, start + i])
        }
        return this.reorder(newOrder)
    }
    sortSelf(compare: (a: T, b:T)=> number) {
        const wrappedItems = this.data.map(value => ({value}))
        const itemToIndex = new Map(wrappedItems.map((item, index) => [item, index]))
        const newItems = wrappedItems.sort((a, b) => compare(a.value, b.value))
        const itemToNewIndex = new Map(newItems.map((item, index) => [item, index]))
        const newOrder: Order[] = newItems.map(item => [itemToIndex.get(item)!, itemToNewIndex.get(item)!])
        return this.reorder(newOrder)
    }
    // TODO 返回一个新的已排好序的元素，对于新增元素的情况，可以使用二分快速插入。
    // sort() {
    //
    // }
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
        if (!this.atomIndexes) this.atomIndexes = this.data.map((_, index) => atom(index))
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
        // CAUTION 生成数据结构的方法应该都不 track Iterable_Key。不然可能导致在 computed 里面的 map 方法被反复执行，这算是一种泄露了。
        // Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)

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
                    const mapContext: MapContext|undefined = useContext ? {
                        onCleanup(fn: MapCleanupFn) {
                            cleanupFns![i] = fn
                        }
                    } : undefined

                    // 注意这里逻辑有点复杂。如果内部有依赖，会发生重新计算，那么重计算时就要用 itemIndex 去更新。因为 index 是可能变化的。
                    let newItemIndex: Atom<number>|undefined
                    const newItemRun = new Computed(() => {
                        //有依赖并且是冲计算，就一定有 newItemIndex。
                        // CAUTION 特别注意这里面的变量，我们只希望  track 用户 mapFn 里面用到的外部  reactive 对象，不希望 track 到自己的 key/index。
                        if(newItemIndex) {
                            this.set(newItemIndex.raw, mapFn(source.data[newItemIndex.raw], newItemIndex, mapContext!))
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
                                    this.set(newItemIndex.raw, mapFn(source.data[newItemIndex.raw]!, newItemIndex, mapContext!))
                                } else {
                                    newItem = mapFn(source.data[newIndex]!, source.atomIndexes?.[newIndex]!, mapContext!)
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
    reduce<U extends Computed = RxList<T>>(reduceFn: (last:U, item: T, index: number) => any, ResultComputed: new (...args:any[])=>U = RxList as any): U {
        const source = this
        return new ResultComputed(
            function computation(this: U) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                // 用 placeholder 生成一个新的 data。
                const placeholder = new ResultComputed()
                for(let i = 0; i < source.data.length; i++) {
                    const getFrame = ReactiveEffect.collectEffect!()
                    reduceFn(placeholder, source.data[i], i)
                    this.effectFramesArray![i] = getFrame() as ReactiveEffect[]
                }

                const result = placeholder.data
                placeholder.destroy()
                delete placeholder.data
                return result
            },
            function applyMapArrayPatch(this: U, _data:any, triggerInfos: TriggerInfo[]) {
                // 只有纯粹的新增在末尾新增，是可以使用增量计算的
                const shouldRecompute = triggerInfos.some((triggerInfo) => {
                    const { method , argv   } = triggerInfo
                    return !(method === 'splice' && argv![0] === source.data.length - argv!.slice(2).length && argv![1] === 0)
                })

                if(shouldRecompute) return false

                triggerInfos.forEach((triggerInfo) => {
                    const { argv   } = triggerInfo
                    const originLength = source.data.length
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
    reduceToAtom<U extends any>(reduceFn: (last:U, item: T, index: number) => any, initialValue: U): Atom<U> {
        const source = this
        return computed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return source.data.reduce(reduceFn, initialValue)
            },
            function applyMapArrayPatch(this: Computed, data:any, triggerInfos: TriggerInfo[]) {
                // 只有纯粹的新增在末尾新增，是可以使用增量计算的
                const shouldRecompute = triggerInfos.some((triggerInfo) => {
                    const { method , argv   } = triggerInfo
                    return !(method === 'splice' && argv![0] === source.data.length - argv!.slice(2).length && argv![1] === 0)
                })

                if(shouldRecompute) return false

                triggerInfos.forEach((triggerInfo) => {
                    const { argv } = triggerInfo
                    const originLength = source.data.length
                    // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                    const newItemsInArgs = argv!.slice(2)
                    for(let i = 0; i < newItemsInArgs.length; i++) {
                        data(reduceFn(data.raw, newItemsInArgs[i], i + originLength))
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
        const searchedItemAndIndexes: { item:T, index:number, deleted:boolean }[] = []

        let trackTargetToSearchItem: WeakMap<any, Set<{ item:T, index:number, deleted:boolean }>> = new WeakMap()

        const disposeAll = () => {
            searchedItemAndIndexes.length = 0
            trackTargetToSearchItem = new WeakMap()
        }

        function searchAndRemember(start:number, end: number, resultComputed: Computed) {
            for(let current=start; current < Math.min(end, source.data.length);current++) {
                const matchResult = matchAndRemember(current, resultComputed)
                if (matchResult) {
                    // 删掉后面的
                    // FIXME 似乎没有处理 trackTargetToSearchItem 中的 cache
                    const deletedItems = searchedItemAndIndexes.splice(current+1)
                    deletedItems.forEach(item => item.deleted = true)
                    return current
                }

            }
            return -1
        }

        function matchAndRemember(current:number, resultComputed: Computed) {
            const currentItem =  {
                item: source.data[current],
                index:current,
                deleted:false
            }
            searchedItemAndIndexes[current] =currentItem
            resultComputed.autoTrack()
            const getFrame = Notifier.instance.collectTrackTarget()
            const matchResult = matchFn(source.data[current])
            const trackTargets = getFrame()
            resultComputed.resetAutoTrack()

            trackTargets.forEach((target) => {
                let items = trackTargetToSearchItem.get(target)
                if (!items) {
                    trackTargetToSearchItem.set(target, items = new Set())
                }
                items.add(currentItem)
            })
            return matchResult
        }

        function checkOne(index: number) {
            if (matchFn(source.data[index])) {
                result(index)
                searchedItemAndIndexes.splice(index+1)
            }
        }

        const result = computed<number>(
            function computation(this: Computed) {
                disposeAll()
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE)
                return searchAndRemember(0, Infinity, this)
            },
            function applyPatch(this: Computed, data: Atom<number>, triggerInfos){
                let patchSuccess = undefined
                // 每次 patch 都需要重新注册所有依赖。
                this.cleanup()
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE)

                triggerInfos.every((triggerInfo) => {
                    const { method , argv  ,key, source: triggerSource } = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    let startFindingIndex = Infinity
                    if (triggerSource === source ) {
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

                        // 需要从 startFindingIndex 开始重找，startFindingIndex 前面不需要
                        if (startFindingIndex !== Infinity) {
                            data(searchAndRemember(startFindingIndex, Infinity, this))
                        }
                    } else {
                        // 任何其他变化都完全重算
                        // 元素计算的内部变化。找到受影响的 items，从小的开始计算。一旦找到就停下。
                        //  一直到所有响应完还有没有找到的话，就继续 search。
                        // CAUTION 一定要切片，否则后面 matchAndRemember 会死循环
                        const itemCandidateSet = trackTargetToSearchItem.get(triggerSource)
                        const itemCandidates = Array.from(itemCandidateSet??[])
                        if (itemCandidates) {

                            let newIndex = -1
                            let lastMatchedChanged = false
                            for(const item of itemCandidates) {
                                if (!item.deleted) {
                                    // 重算的时候就要把上次的删掉，因为 matchAndRemember 中会重新生成个新对象。
                                    itemCandidateSet!.delete(item)
                                    const matchResult = matchAndRemember(item.index, this)
                                    if (!lastMatchedChanged && item.index ===data.raw) lastMatchedChanged = true
                                    if (matchResult) {
                                        // 删掉后面的
                                        // FIXME 更好地处理 trackTargetToSearchItem 中的 cache
                                        const deletedItems = searchedItemAndIndexes.splice(item.index+1)
                                        deletedItems.forEach(item => item.deleted = true)
                                        newIndex = item.index
                                        break
                                    }
                                } else {
                                    // FIXME 顺便删除一下，应该有更好的方式
                                    trackTargetToSearchItem.get(triggerSource)!.delete(item)
                                }
                            }
                            // 只要找到了，index 肯定更小，应为我们是往前面建立的观察
                            if (newIndex!==-1) {
                                data(newIndex)
                            } else {
                                // TODO 上一次的值如果也受影响了变成不匹配的了，并且受影的也没有匹配的，就要从上一次继续往后搜索
                                if (lastMatchedChanged) {
                                    data(searchAndRemember(data.raw+1, Infinity, this))
                                }
                            }
                        } else {
                            patchSuccess = false
                            // 提前结束
                            return false
                        }
                    }
                })
                // 显式 return false 触发重算
                return patchSuccess
            },
            true,
            {
                onDestroy:disposeAll
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
                    if (!lastValue.raw) {
                        if (item === this.data[0]) {
                            filtered.unshift(item)
                        } else {
                            filtered.push(item)
                        }
                    }
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

                        // 如果是从头插入，要逆序遍历 unshift 才能保持正确顺序
                        const newItemsInArgs = argv!.slice(2)
                        if (argv![0] === 0) {
                            newItemsInArgs.reverse()
                        }

                        // 先分好组，再一次性操作，可以合并 info，还能间接提高 dom 操作性能。
                        const newGroupedItems = new Map<any, T[]>()
                        newItemsInArgs.forEach((item) => {
                            const groupKey = getKey(item)
                            if (!newGroupedItems.has(groupKey)) {
                                newGroupedItems.set(groupKey,[])
                            }
                            // CAUTION 这里并不能真正保证 group 里面的顺序和原来的一致。只能尽量处理首位情况。
                            if (argv![0] === 0) {
                                newGroupedItems.get(groupKey)!.unshift(item)
                            } else {
                                newGroupedItems.get(groupKey)!.push(item)
                            }
                        })

                        newGroupedItems.forEach((group, key) => {
                            if (!this.data.has(key)) {
                                this.set(key, new RxList(group))
                            } else {
                                if (argv![0] === 0) {
                                    this.data.get(key)!.unshift(...group)
                                } else {
                                    this.data.get(key)!.push(...group)
                                }
                            }
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
        this.effectFramesArray?.forEach((frames) => {
          frames.forEach((frame) => {
            this.destroyEffect(frame)
          })
        })
        this.indexKeyDeps.clear()
        this.atomIndexes = undefined
    }

    createSelection(currentValues: RxSet<T|number>|Atom<T|null|number>, autoResetValue?: boolean) {
        return createSelection(this, currentValues, autoResetValue)
    }
    createSelections(...args: [RxSet<T|number>|Atom<T|null|number>, boolean?][]) {
        return createSelections<T>(this, ...args)
    }
    createIndexKeySelection(currentValues: RxSet<number>|Atom<null|number>, autoResetValue?:boolean) {
        return createIndexKeySelection(this, currentValues, autoResetValue)
    }
}

type SelectionInner = {
    trackIndicators:any,
    trackCurrentValues:any,
    createNewIndicator:any,
    updateIndicatorsFromCurrentValueChange:any,
    stopAutoResetValue:any,
    deleteIndicator:any,
    currentValues:any
}
export function createSelectionInner<T>(source: RxList<T>, currentValues: RxSet<T|number>|Atom<T|null|number>, autoResetValue = false): SelectionInner {
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

    function deleteIndicator(item:T) {
        itemToIndicator.delete(item)
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

    return {
        trackIndicators,
        trackCurrentValues,
        createNewIndicator,
        updateIndicatorsFromCurrentValueChange,
        stopAutoResetValue,
        deleteIndicator,
        currentValues
    }
}




function createRxListWithSelectionInners<T>(source:RxList<T>, ...inners: SelectionInner[]) : RxList<[T, ...Atom<boolean>[]]>{

    function updateIndicatorsFromSourceChange(list: RxList<[T, ...Atom<boolean>[]]>, triggerInfo: TriggerInfo) {
        if (triggerInfo.method === 'splice') {
            const { methodResult , argv } = triggerInfo
            const newItemsInArgs = argv!.slice(2)
            const deleteItems: T[] = methodResult || []
            deleteItems.forEach((item) => {
                inners.forEach(inner => inner.deleteIndicator(item))
            })
            list.splice(argv![0], argv![1], ...newItemsInArgs.map((item) => [item, ...inners.map(inner => inner.createNewIndicator(item))] as [T, ...Atom<boolean>[]]))
        } else {
            //explicit key change
            const {  newValue, key } = triggerInfo
            list.set(key as number, [newValue as T, ...inners.map(inner => inner.createNewIndicator(newValue as T))] as [T, Atom<boolean>])
        }
    }

    return new RxList(
        function computation(this:Computed ) {
            inners.forEach(inner => {
                inner.trackIndicators(this)
                inner.trackCurrentValues(this)
            })

            return source.data.map((item) => [item, ...inners.map(inner => inner.createNewIndicator(item))])
        },
        function applyPatch(this: RxList<[T, Atom<boolean>]>, _data, triggerInfos: TriggerInfo[]) {
            triggerInfos.forEach((triggerInfo) => {
                if (triggerInfo.source === source) {
                    // 来自 source 的变化，需要同步 indicators
                    updateIndicatorsFromSourceChange(this, triggerInfo)
                } else {
                    // 来自 currentValues 的变化，需要同步 indicators
                    inners.forEach(inner => {
                        if (triggerInfo.source === inner.currentValues) {
                            inner.updateIndicatorsFromCurrentValueChange(triggerInfo)
                        }
                    })
                }
            })
        },
        undefined,
        {
            onDestroy() {
                inners.forEach(inner => {
                    inner.stopAutoResetValue?.destroy()
                })
            }
        }
    )
}

type SelectionArgs<T> = [RxSet<T|number>|Atom<T|null|number>, boolean?]
export function createSelection<T>(source: RxList<T>, currentValues: SelectionArgs<T>[0], autoResetValue : SelectionArgs<T>[1] = false): RxList<[T, Atom<boolean>]> {
    return createRxListWithSelectionInners(source, createSelectionInner(source, currentValues, autoResetValue)) as  RxList<[T, Atom<boolean>]>
}

export function createSelections<T>(source: RxList<T>, ...args: SelectionArgs<T>[]): RxList<[T, ...Atom<boolean>[]]> {
    return createRxListWithSelectionInners(source, ...args.map(arg => createSelectionInner(source, ...arg)))
}

// TODO multiple
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

