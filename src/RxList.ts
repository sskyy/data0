import {ApplyPatchType, atomComputed, CallbacksType, Computed, DirtyCallback, GetterType} from "./computed.js";
import {Atom, atom, isAtom} from "./atom.js";
import {Dep} from "./dep.js";
import {InputTriggerInfo, ITERATE_KEY, Notifier, TriggerInfo} from "./notify.js";
import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
import {assert} from "./util.js";
import {ReactiveEffect} from "./reactiveEffect.js";
import {RxMap} from "./RxMap.js";

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
            super.runEffect()
        }
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
        Notifier.instance.pauseTracking()
        Notifier.instance.createEffectSession()

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
        // 只有当有 indexKeyDeps 的时候才需要手动查找 dep 和触发，这样效率更高
        if (this.indexKeyDeps?.size > 0){
            for (let i = start; i < changedIndexEnd; i++) {
                Notifier.instance.trigger(this, TriggerOpTypes.SET, { key: i, newValue: this.data[i], oldValue: oldValues[i]})
            }
        }

        if (this.atomIndexes) {
            this.atomIndexes.splice(start, deleteCount, ...items.map((_, index) => atom(index + start)))
            for (let i = start; i <changedIndexEnd; i++) {
                // 注意这里的 ?. ，因为 splice 之后可能长度不够了。
                this.atomIndexes[i]?.(i)
            }
        }
        // CAUTION 无论有没有 indexKeyDeps 都要触发 Iterator_Key，
        //  特别这里注意，我们利用传了 key 就会把对应 key 的 dep 拿出来的特性来 trigger ITERATE_KEY.
        Notifier.instance.trigger(this, TriggerOpTypes.METHOD, { method:'splice', key: ITERATE_KEY, argv: [start, deleteCount, ...items], methodResult: result })

        Notifier.instance.digestEffectSession()
        Notifier.instance.resetTracking()
        return result
    }
    // 显式 set 某一个 index 的值
    set(index: number, value: T) {
        const oldValue = this.data[index]
        this.data[index] = value

        // 这里还是用 trigger TriggerOpTypes.SET，因为系统在处理 TriggerOpTypes.SET 的时候还会对 listLike 的数据 触发 ITERATE_KEY。
        if (index > this.data.length - 1) {
            Notifier.instance.trigger(this, TriggerOpTypes.ADD, { key: index, newValue: value, oldValue})
        } else {
            Notifier.instance.trigger(this, TriggerOpTypes.SET, { key: index, newValue: value, oldValue})
        }
        Notifier.instance.trigger(this, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { key: index, newValue: value, oldValue})
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
        const source = this
        const useIndex = mapFn.length>1 && !options?.ignoreIndex
        const useContext = mapFn.length>2
        if(useIndex) {
            source.addAtomIndexesDep()
        }

        // CAUTION cleanupFns 是用户自己用 context.onCleanup 收集的，因为可能用到 mapFn 中的局部变量
        //  如果可以直接从 mapFn return value 中来销毁副作用，那么应该使用 options.onCleanup 来注册一个统一的销毁函数，这样能提升性能，不需要建立 cleanupFns 数组。
        const cleanupFns: MapCleanupFn[]|undefined = useContext ? [] : undefined

        return new RxList(
            function computation(this: RxList<U>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);

                return source.data.map((_: T, index) => {
                    const getFrame = ReactiveEffect.collectEffect!()
                    const mapContext: MapContext|undefined = useContext ? {
                        onCleanup(fn: MapCleanupFn) {
                            cleanupFns![index] = fn
                        }
                    } : undefined
                    // CAUTION 注意这里的 item 要用 at 拿包装过的 reactive 对象
                    const newItem = mapFn(source.at(index)!, source.atomIndexes?.[index]!, mapContext!)
                    this.effectFramesArray![index] = getFrame() as ReactiveEffect[]
                    return newItem
                })
            },
            function applyMapArrayPatch(this: RxList<U>, data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {

                    const { method , argv  ,key } = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    options?.beforePatch?.(triggerInfo)

                    if (method === 'splice') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newItemsInArgs = argv!.slice(2)
                        const effectFrames: ReactiveEffect[][] = []
                        const newCleanups: MapCleanupFn[] = []
                        const newItems = newItemsInArgs.map((_, index) => {
                            const item = source.at(index+ argv![0])!
                            const getFrame = this.collectEffect()
                            const mapContext: MapContext|undefined = useContext ? {
                                onCleanup(fn: MapCleanupFn) {
                                    newCleanups![index] = fn
                                }
                            } : undefined
                            const newItem = mapFn(item, source.atomIndexes?.[index+ argv![0]]!, mapContext!)
                            effectFrames![index] = getFrame() as ReactiveEffect[]
                            return newItem
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
                            deletedItems.forEach((item, index) => {
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
                        const oldItem = this.at(index)!
                        const oldCleanupFn = cleanupFns?.[index]

                        this.set(index, mapFn(source.at(index)!, source.atomIndexes?.[index]!, mapContext!))
                        const newFrame = getFrame() as ReactiveEffect[]
                        this.effectFramesArray![index].forEach((effect) => {
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
                onDestroy(this: RxList<U>, effect)  {
                    if (useIndex) {
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
    reduce<U>(reduceFn: (last: RxList<U>, item: T, index: number) => any) {
        const source = this
        return new RxList(
            function computation(this: RxList<U>, track) {
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
            function applyMapArrayPatch(this: RxList<U>, data, triggerInfos) {
                // FIXME 支持不了的还是要走全量更新怎么写？？？
                // FIXME 收集 effectFrames 没有销毁
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv   } = triggerInfo
                    assert(method === 'splice' && argv![0] === source.data.length - argv!.slice(2).length && argv![1] === 0, 'reduce can only support append')
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
        const source = this
        let foundIndex = -1
        return atomComputed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE)
                return source.data.find((item, index) => {
                    if (matchFn(item)) {
                        foundIndex = index
                        return true
                    }
                    return false
                })
            },
            function applyPatch(this: Computed, data: Atom<T>, triggerInfos){
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key } = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    let startFindingIndex = -1

                    if (method === 'splice') {
                        const startIndex = argv![0] as number
                        if (foundIndex >= startIndex) {
                            startFindingIndex = startIndex
                        }

                    } else {
                        // explicit key change
                        if (foundIndex === key) {
                            startFindingIndex = key as number
                        }
                    }

                    if (startFindingIndex !== -1) {
                        foundIndex = -1
                        for (let i = startFindingIndex; i < source.data.length; i++) {
                            if (matchFn(source.data[i]!)) {
                                foundIndex = i
                                data(source.data[i]!)
                                return
                            }
                        }

                        data(null)
                    }
                })
            }
        )
    }
    findIndex(matchFn:(item: T) => boolean): Atom<number> {
        const source = this
        let foundIndex = -1
        return atomComputed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE)
                return source.data.findIndex((item, index) => {
                    if (matchFn(item)) {
                        foundIndex = index
                        return true
                    }
                    return false
                })
            },
            function applyPatch(this: Computed, data: Atom<T>, triggerInfos){
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key } = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    let startFindingIndex = -1

                    if (method === 'splice') {
                        const startIndex = argv![0] as number
                        if (foundIndex >= startIndex) {
                            startFindingIndex = startIndex
                        }

                    } else {
                        // explicit key change
                        if (foundIndex === key) {
                            startFindingIndex = key as number
                        }
                    }

                    if (startFindingIndex !== -1) {
                        foundIndex = -1
                        for (let i = startFindingIndex; i < source.data.length; i++) {
                            if (matchFn(source.data[i]!)) {
                                foundIndex = i
                                data(foundIndex)
                                return
                            }
                        }

                        data(foundIndex)
                    }

                })
            }
        )
    }

    filter(filterFn: (item:T) => boolean) {
        const source = this
        return new RxList(
            function computation(this: RxList<T>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE)
                return source.data.filter(filterFn)
            },
            function applyPatch(this: RxList<T>, data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    // TODO 在删除大量数据的时候，直接重新执行更快？
                    if (method === 'splice') {
                        const deleteItems = methodResult as T[] || []
                        deleteItems.forEach((item) => {
                            if (this.data.includes(item)) {
                                this.splice(this.data.indexOf(item), 1)
                            }
                        })
                        const newItemsInArgs = argv!.slice(2)
                        newItemsInArgs.forEach((item) => {
                            if(filterFn(item)) {
                                this.push(item)
                            }
                        })
                    } else {
                        // explicit key change
                        const index = key as number
                        const item = source.data[index]
                        if (filterFn(item)) {
                            this.push(item)
                        }
                        if (this.data.includes(oldValue as T)) {
                            this.splice(this.data.indexOf(oldValue as T), 1)
                        }
                    }
                })
            }
        )
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
            function applyPatch(this: RxMap<any, RxList<T>>, data, triggerInfos) {
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
                                this.data.set(groupKey, new RxList([]))
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
                            this.data.set(newGroupKey, new RxList([]))
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
            function applyPatch(this: RxMap<any, T>, data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, newValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (method === 'splice') {
                        const deleteItems = methodResult as T[] || []
                        deleteItems.forEach((item) => {
                            const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(item) : item[inputIndexKey]
                            this.data.delete(indexKey)
                        })
                        const newItemsInArgs = argv!.slice(2)
                        newItemsInArgs.forEach((item) => {
                            const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(item) : item[inputIndexKey]

                            assert(!this.data.has(indexKey), 'indexBy key is already exist')
                            this.data.set(indexKey, item)
                        })
                    } else {
                        // explicit key change
                        const indexKey = typeof inputIndexKey === 'function' ? inputIndexKey(oldValue as T) : (oldValue as T)[inputIndexKey]
                        this.data.delete(indexKey)
                        const newKey = typeof inputIndexKey === 'function' ? inputIndexKey(newValue as T) : (newValue as T)[inputIndexKey]
                        this.data.set(newKey, newValue as T)
                    }
                })
            }
        )
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
            function applyPatch(this: RxMap<any, T>, data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {
                    const { method , argv  ,key, oldValue, newValue, methodResult} = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (method === 'splice') {
                        const deleteItems = methodResult as [any, any][] || []
                        deleteItems.forEach(([indexKey, value]) => {
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

    get length(): Atom<number> {
        const source = this
        return atomComputed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return source.data.length
            },
            function applyPatch(this: Computed, data: Atom<number>, triggerInfos){
                data(source.data.length)
            }
        )
    }

    // FIXME onUntrack 的时候要把 indexKeyDeps 里面的 dep 都删掉。因为 Effect 没管这种情况。
    onUntrack(effect: ReactiveEffect) {

    }

    createSelection(currentValues: RxList<T|number>|Atom<T|null|number>) {
        return createSelection(this, currentValues)
    }
    createIndexKeySelection(currentValues: RxList<T|number>|Atom<T|null|number>) {
        return createIndexKeySelection(this, currentValues)
    }
}


export function createSelection<T>(source: RxList<T>, currentValues: RxList<T|number>|Atom<T|null|number>, autoResetValue = false): RxList<[T, Atom<boolean>]> {
    const itemsWithIndicators = source.map<[T, Atom<boolean>]>((item) => [item, atom(false)] as [T, Atom<boolean>])
    const itemToIndicator = itemsWithIndicators.toMap()

    const syncCurrentValuesToIndicators = new Computed(
        function computation(this: Computed) {
            this.manualTrack(itemToIndicator, TrackOpTypes.ITERATE, ITERATE_KEY);
            if(isAtom(currentValues)) {
                itemToIndicator.get(currentValues.raw as T)?.(true)
            } else {
                currentValues.data.forEach((value) => {
                    itemToIndicator.get(value as T)?.(true)
                })
            }
        },
        function applyPatchToIndicator(this: Computed, data, triggerInfos: TriggerInfo[]) {
            triggerInfos.forEach((triggerInfo) => {
                // 只 track 了 'ADD' 的情况
                const { key, newValue: newIndicator, type } = triggerInfo as {key:T, newValue: Atom<boolean>, type: TriggerOpTypes}
                if (type === TriggerOpTypes.ADD) {
                    if(isAtom(currentValues)) {
                        if(key === currentValues.raw) {
                            newIndicator(true)
                        }
                    } else {
                        if (currentValues.data.includes(key)) {
                            newIndicator(true)
                        }
                    }
                } else if(type === TriggerOpTypes.DELETE && autoResetValue) {
                    if (isAtom(currentValues)) {
                        // 删除了项中有 currentValue 的情况
                        if (key === currentValues.raw) {
                            currentValues(null)
                        }
                    } else {
                        if(currentValues.data.includes(key)) {
                            currentValues.splice(currentValues.data.indexOf(key), 1)
                        }
                    }
                }
            })
        }
    )

    syncCurrentValuesToIndicators.runEffect()

    const syncIndicatorToCurrentValue = new Computed(
        function syncCurrentValue(this: Computed) {
            if (isAtom(currentValues)) {
                this.manualTrack(currentValues, TrackOpTypes.ATOM, 'value');
            } else {
                this.manualTrack(currentValues, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
            }
        },
        function applyPatchToIndicator(this: Computed, data, triggerInfos: TriggerInfo[]) {
            triggerInfos.forEach((triggerInfo) => {
                const { oldValue, newValue, method } = triggerInfo
                if(isAtom(currentValues)) {
                    itemToIndicator.get(oldValue as T)?.(false)
                    itemToIndicator.get(newValue as T)?.(true)
                } else {
                    // RxList，只有 splice 操作
                    assert(method === 'splice', 'RxList currentValues can only support splice')

                    const deleteItems = triggerInfo.methodResult
                    const insertItems = triggerInfo.argv!.slice(2);

                    (deleteItems as T[]).forEach((item:T) => {
                        const indicator = itemToIndicator?.get(item)
                        indicator?.(false)
                    })
                    insertItems.forEach((item:T) => {
                        const indicator = itemToIndicator?.get(item)
                        indicator?.(true)
                    })
                }
            })
        }
    )

    syncIndicatorToCurrentValue.runEffect()

    itemsWithIndicators.on('destroy', () => {
        syncCurrentValuesToIndicators.destroy()
        syncIndicatorToCurrentValue.destroy()
    })

    return itemsWithIndicators
}


export function createIndexKeySelection<T>(source: RxList<T>, currentValues: RxList<T|number>|Atom<T|null|number>, resetValue = false): RxList<[T, Atom<boolean>]> {
    const itemsWithIndicators = source.map<[T, Atom<boolean>]>((item) => [item, atom(false)] as [T, Atom<boolean>])

    const syncIndicators = new Computed(
        function computation(this: RxList<[T, Atom<boolean>]>) {
            this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
            const selectedValues = isAtom(currentValues) ? (currentValues.raw === null ? [] : [currentValues.raw]) : currentValues.data
            selectedValues.forEach((value) => {
                itemsWithIndicators.at(value as number)?.[1](true)
            })
        },
        function applyMapArrayPatch(this: RxList<[T, Atom<boolean>]>, data, triggerInfos) {
            triggerInfos.forEach((triggerInfo) => {
                //2. 来自 source 的变化
                const { method , argv  , key } = triggerInfo
                // 只有 useIndexAsKey 的时候才会有 splice 变化
                if (method === 'splice') {
                    const startIndex = argv![0] as number
                    const deleteCount = argv![1]
                    const insertCount = argv!.slice(2)!.length

                    const selectedValues = isAtom(currentValues) ? [currentValues.raw] : currentValues.data

                    const outOfValueIndexes:number[] = []
                    // 因为 index 产生了变化，所以要更新 indicator
                    selectedValues.forEach((value, valueIndex) => {
                        const index = value as number
                        if (index > itemsWithIndicators.data.length - 1) {
                            outOfValueIndexes.push(valueIndex)
                        } else {
                            // 只有 index 在后面的才是还存在，并且受了影响需要处理的。
                            if (index >= startIndex && deleteCount !== insertCount) {
                                const indexAfterChange = index + insertCount - deleteCount
                                const oldIndexIndicator = itemsWithIndicators.data.at(indexAfterChange)![1]
                                oldIndexIndicator(false)
                            }
                            const newIndicator = itemsWithIndicators.data.at(index)![1]
                            newIndicator?.(true)
                        }
                    })

                    // 处理超出的 index
                    if (resetValue && outOfValueIndexes.length > 0) {
                        if (isAtom(currentValues)) {
                            // 不用判断，如果有，肯定就是 currentValues 超过了
                            currentValues(null)
                        } else {
                            // 重新触发一下。
                            outOfValueIndexes.forEach((valueIndex, index) => {
                                // CAUTION 因为删除一个 index 就会变化，所以要减去 index
                                currentValues.splice(outOfValueIndexes[0]-index, 0)
                            })
                        }
                    }

                } else {
                    // explicit key change
                    if (isAtom(currentValues)) {
                        if (currentValues.raw === key) {
                            itemsWithIndicators.data[key as number][1](true)
                        }
                    } else {
                        if (currentValues.data.includes(key as number)) {
                            itemsWithIndicators.data[key as number][1](true)
                        }
                    }
                }
            })
        },
    )

    syncIndicators.runEffect()

    const syncCurrentValuesToIndicators = new Computed(
        function syncToIndicator(this: Computed) {
            if (isAtom(currentValues)) {
                this.manualTrack(currentValues, TrackOpTypes.ATOM, 'value');
            } else {
                this.manualTrack(currentValues, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
            }
        },
        function applyPatchToIndicators(this:Computed, data, triggerInfos) {
            triggerInfos.forEach((triggerInfo) => {
                if (triggerInfo.source === currentValues) {
                    if(currentValues instanceof RxList) {
                        // 如果是多选，currentValues 只能接受 splice 操作
                        assert(triggerInfo.method === 'splice', 'currentValues can only support splice')
                    }

                    const deleteItems = isAtom(currentValues) ? (triggerInfo.oldValue === null ? [] : [triggerInfo.oldValue]) : triggerInfo.methodResult || []
                    const insertItems = isAtom(currentValues) ? (triggerInfo.newValue === null ? [] : [triggerInfo.newValue]) : triggerInfo.argv!.slice(2);
                    (deleteItems as number[]).forEach((index:number) => {
                        itemsWithIndicators.data[index]?.[1]?.(false)
                    })

                    insertItems.forEach((index:number) => {
                        itemsWithIndicators.data[index][1]?.(true)
                    })
                }
            })
        }
    )

    syncCurrentValuesToIndicators.runEffect()

    itemsWithIndicators.on('destroy', () => {
        syncIndicators.destroy()
        syncCurrentValuesToIndicators.destroy()
    })

    return itemsWithIndicators
}

