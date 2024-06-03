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
        let cleanupFns: MapCleanupFn[]|undefined

        return new RxList(
            function computation(this: RxList<U>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                cleanupFns = useContext ? [] : undefined

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
            function applyMapArrayPatch(this: RxList<U>, _data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {

                    const { method , argv  ,key } = triggerInfo
                    assert((method === 'splice' || key !== undefined), 'trigger info has no method and key')

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
                onDestroy(this: RxList<U>)  {
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

                // autoTrack filter 的过程，如果依赖了其他的 reactive 对象，后面在 applyPatch 的时候就要 return  false 走全量计算。
                this.autoTrack()
                const result = source.data.filter(filterFn)
                this.resetAutoTrack()
                return result
            },
            function applyPatch(this: RxList<T>, _data, triggerInfos) {
                const shouldRecompute = triggerInfos.some((triggerInfo) => {
                  return triggerInfo.source !== source || !(triggerInfo.type === TriggerOpTypes.METHOD || triggerInfo.type === TriggerOpTypes.EXPLICIT_KEY_CHANGE)
                })

                // explicit return false 表示要重算
                if (shouldRecompute) return false

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
            function applyPatch(this: RxMap<any, T>, _data, triggerInfos) {
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

    get length(): Atom<number> {
        const source = this
        return atomComputed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return source.data.length
            },
            function applyPatch(this: Computed, data: Atom<number>){
                data(source.data.length)
            }
        )
    }

    // FIXME onUntrack 的时候要把 indexKeyDeps 里面的 dep 都删掉。因为 Effect 没管这种情况。
    onUntrack(_effect: ReactiveEffect) {

    }

    createSelection(currentValues: RxList<T|number>|Atom<T|null|number>, autoResetValue?: boolean) {
        return createSelection(this, currentValues, autoResetValue)
    }
    createIndexKeySelection(currentValues: RxList<T|number>|Atom<T|null|number>, autoResetValue?:boolean) {
        return createIndexKeySelection(this, currentValues, autoResetValue)
    }
}


export function createSelection<T>(source: RxList<T>, currentValues: RxList<T|number>|Atom<T|null|number>, autoResetValue = false): RxList<[T, Atom<boolean>]> {
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
        const indicator = atom(isAtom(currentValues) ? currentValues.raw === item : currentValues.data.includes(item))
        itemToIndicator.set(item, indicator)
        return indicator
    }

    function deleteCurrentValueIfItemRemoved(item:T) {
        if (isAtom(currentValues)) {
            if (item === currentValues.raw) {
                currentValues(null)
            }
        } else {
            if(currentValues.data.includes(item)) {
                currentValues.splice(currentValues.data.indexOf(item), 1)
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
                    if(autoResetValue) {
                        deleteCurrentValueIfItemRemoved(item)
                    }
                })
        } else {
            //explicit key change
            const { oldValue, newValue, key } = triggerInfo
            list.set(key as number, [newValue as T, createNewIndicator(newValue as T)] as [T, Atom<boolean>])
            if(autoResetValue) {
                deleteCurrentValueIfItemRemoved(oldValue as T)
            }
        }
    }


    function updateIndicatorsFromCurrentValueChange(triggerInfo: TriggerInfo) {
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
    }

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
                    if (!isAtom(currentValues)) {
                        assert(triggerInfo.method === 'splice', 'currentValues can only support splice')
                    }
                    updateIndicatorsFromCurrentValueChange(triggerInfo)
                }
            })
        }
    )

}


export function createIndexKeySelection<T>(source: RxList<T>, currentValues: RxList<T|number>|Atom<T|null|number>, autoResetValue = false): RxList<[T, Atom<boolean>]> {

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

                const selectedValues = isAtom(currentValues) ? [currentValues.raw] : currentValues.data
                const outOfValueIndexes:number[] = []
                // 因为 index 产生了变化，所以要更新 indicator
                selectedValues.forEach((value, valueIndex) => {
                    const index = value as number
                    if (index > list.data.length - 1) {
                        outOfValueIndexes.push(valueIndex)
                    } else {
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

                // 处理超出的 index
                if (autoResetValue && outOfValueIndexes.length > 0) {
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
            // RxList，只有 splice 操作
            assert(method === 'splice', 'RxList currentValues can only support splice')

            const deleteItems = triggerInfo.methodResult
            const insertItems = triggerInfo.argv!.slice(2);

            (deleteItems as number[]).forEach((index) => {
                list.data[index][1](false)
            })
            insertItems.forEach((item:number) => {
                list.data[item][1](true)
            })
        }
    }

    function createNewIndicator(index: number) {
        return atom(isAtom(currentValues) ? currentValues.raw === index : currentValues.data.includes(index))
    }

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
                    // 来自 currentValues 的变化，需要同步 indicators
                    if (!isAtom(currentValues)) {
                        assert(triggerInfo.method === 'splice', 'currentValues can only support splice')
                    }
                    updateIndicatorsFromCurrentValueChange(this, triggerInfo)
                }
            })
        }
    )

}

