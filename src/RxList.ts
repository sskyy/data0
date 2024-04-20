import {
    ApplyPatchType,
    atomComputed,
    CallbacksType,
    Computed,
    computed,
    destroyComputed,
    DirtyCallback,
    GetterType
} from "./computed.js";
import {Atom, atom} from "./atom.js";
import {Dep} from "./dep.js";
import {InputTriggerInfo, ITERATE_KEY, Notifier} from "./notify.js";
import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
import {assert} from "./util.js";
import {ReactiveEffect} from "./reactiveEffect.js";
import {RxMap} from "./RxMap.js";
import {ManualCleanup} from "./manualCleanup.js";

export class RxList<T> extends Computed {
    data!: T[]
    indexKeyDeps = new Map<number, Dep>()
    atomIndexes? :Atom<number>[]
    atomIndexesDepCount = 0

    constructor(source: T[]|null, public getter?: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType) {
        // 自己可能是 computed，也可能是最初的 reactive
        super(getter, applyPatch, scheduleRecompute, callbacks, undefined, undefined, true)

        // 自己是 source
        if (source) {
            this.data = source
        }
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
        const changedIndexEnd = deleteItemsCount !== items.length ? this.data.length : start + items.length
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
            for (let i = start; i < changedIndexEnd; i++) {
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
    map<U>(mapFn: (item: T, index?: Atom<number>) => U, beforePatch?: (triggerInfo: InputTriggerInfo) => any, scheduleRecompute?: DirtyCallback ) : RxList<U>{
        const source = this
        if(mapFn.length>1) {
            source.addAtomIndexesDep()
        }

        return new RxList(
            null,
            function computation(this: RxList<U>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                this.manualTrack(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return source.data.map((_: T, index) => {
                    const getFrame = ReactiveEffect.collectEffect!()
                    // CAUTION 注意这里的 item 要用 at 拿包装过的 reactive 对象
                    const newItem = mapFn(source.at(index)!, source.atomIndexes?.[index])
                    this.effectFramesArray![index] = getFrame() as ReactiveEffect[]
                    return newItem
                })
            },
            function applyMapArrayPatch(this: RxList<U>, data, triggerInfos) {
                triggerInfos.forEach((triggerInfo) => {

                    const { method , argv  ,key } = triggerInfo
                    assert(!!(method === 'splice' || key), 'trigger info has no method and key')

                    if (beforePatch) beforePatch(triggerInfo)

                    if (method === 'splice') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newItemsInArgs = argv!.slice(2)
                        const effectFrames: ReactiveEffect[][] = []
                        const newItems = newItemsInArgs.map((_, index) => {
                            const item = source.at(index+ argv![0])!
                            const getFrame = this.collectEffect()
                            const newItem = mapFn(item, source.atomIndexes?.[index+ argv![0]])
                            effectFrames![index] = getFrame() as ReactiveEffect[]
                            return newItem
                        })
                        this.splice(argv![0], argv![1], ...newItems)
                        const deletedFrames = this.effectFramesArray!.splice(argv![0], argv![1], ...effectFrames)
                        deletedFrames.forEach((frame) => {
                            frame.forEach((effect) => {
                                this.destroyEffect(effect)
                            })
                        })
                    } else {
                        // explicit key change
                        // CAUTION add/update 一定都要全部重新从 source 里面取，因为这样才能得到正确的 proxy。newValue 是 raw data，和 mapFn 里面预期拿到的不一致。
                        // 没有 method 说明是 explicit_key_change 变化
                        const index = key as number
                        const getFrame = this.collectEffect()
                        this.set(index, mapFn(source.at(index)!, source.atomIndexes?.[index]))
                        const newFrame = getFrame() as ReactiveEffect[]
                        this.effectFramesArray![index].forEach((effect) => {
                            this.destroyEffect(effect)
                        })
                        this.effectFramesArray![index] = newFrame
                    }
                })
            },
            scheduleRecompute,
            {
                onDestroy: (effect) => {
                    if (mapFn.length > 1) {
                        source.removeAtomIndexesDep()
                    }
                }
            },
        )
    }
    // 另一种 map
    reduce<U>(reduceFn: (last: RxList<U>, item: T, index: number) => any) {
        const source = this
        return new RxList(
            null,
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
            null,
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
            null,
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
            null,
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

    createUniqueMatch(useIndexAsKey = false, initialValue?: Atom<T>|Atom<number|null>) {
        return new RxListUniqueMatch(this, useIndexAsKey, initialValue)
    }
}

export class RxListUniqueMatch<T> extends ManualCleanup{
    public currentIndicator = atom<Atom<boolean>>(null)
    public currentValue: Atom<T>|Atom<number|null>
    public itemsWithIndicator?:RxList<[T, Atom<boolean> ]>
    public itemsWithIndicatorAndIndex?:RxList<[T, Atom<boolean>, Atom<number>]>
    public itemToIndicator?:WeakMap<any, Atom<boolean>>
    public watchIndex?: Atom<null>
    constructor(public source: RxList<T>, public useIndexAsKey = false, currentValue?: Atom<T>|Atom<number|null>) {
        super()
        if (currentValue !== undefined) {
            this.currentValue = currentValue
        } else {
            this.currentValue = this.useIndexAsKey ? atom<number|null>(null) : atom<T>(null)
        }
    }
    createItemsWithIndicator() {
        this.itemsWithIndicator = this.source.map((item) => {
            const matched = this.useIndexAsKey ? false : item === this.currentValue.raw
            const indicator = atom(matched)
            if (matched) this.currentIndicator(indicator)

            if(!this.useIndexAsKey && typeof item === 'object') {
                if (!this.itemToIndicator) this.itemToIndicator = new WeakMap()
                this.itemToIndicator.set(item, indicator)
            }
            return [item, indicator]
        })


        const matchObj = this
        // 一定要放到 itemsWithIndicator 后面，才能保证 computed patch 的时候能拿到已经更新好的 itemsWithIndicator
        if (this.useIndexAsKey && !this.watchIndex) {
            this.watchIndex = computed(
                function manualTrack( this: Computed) {
                    this.manualTrack(matchObj.itemsWithIndicator!, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                    return null
                },
                function applyPatch(){
                    const currentValue = matchObj.currentValue()
                    if (currentValue !== null) {
                        // 重新触发一下。
                        matchObj.set(currentValue)
                    }
                })
        }
    }
    createItemsWithIndicatorAndIndex() {
        if (!this.itemsWithIndicator) this.createItemsWithIndicator()

        this.itemsWithIndicatorAndIndex = this.itemsWithIndicator!.map(([item, indicator], index) => {
            if (this.useIndexAsKey)  {
                if (index?.raw === this.currentValue.raw) {
                    indicator(true)
                    this.currentIndicator(indicator)
                }
            }

            return [item, indicator, index!]
        })
    }
    set(value: T|number) {
        this.currentValue(value)

        if (this.useIndexAsKey) {
            assert(!!this.source.data[value as number], 'value not in source')
        } else {
            assert(this.source.data.includes(value as T), 'value not in source')
        }

        const lastIndicator = this.currentIndicator() as Atom<boolean>|null
        if (lastIndicator) {
            lastIndicator(false)
        }

        let newIndicator: Atom<boolean>|undefined
        if (this.useIndexAsKey) {
             newIndicator =  this.itemsWithIndicator?.at(value as number)![1]
            // itemsWithIndicatorAndIndex 是用 itemsWithIndicator 派生的，所以只要管 itemsWithIndicator 就行了。
        } else {
             newIndicator = this.itemToIndicator ?
                this.itemToIndicator?.get(value)! :
                this.itemsWithIndicator?.at(this.source.data.indexOf(value as T))![1]
        }

        if (newIndicator) {
            newIndicator(true)
            this.currentIndicator(newIndicator)
        }

    }
    map<U>(mapFn: (...args: any[]) => U) {
        if (mapFn.length > 2 && !this.itemsWithIndicatorAndIndex) {
            this.createItemsWithIndicatorAndIndex()
        } else if (mapFn.length <= 2 && !this.itemsWithIndicator) {
            this.createItemsWithIndicator()
        }

        const container = mapFn.length === 3 ? this.itemsWithIndicatorAndIndex! : this.itemsWithIndicator!

        return container.map((arg: any[]) => mapFn(...arg))
    }
    destroy() {
        this.currentIndicator(null)
        this.itemsWithIndicator?.destroy()
        this.itemsWithIndicatorAndIndex?.destroy()
        this.itemToIndicator = undefined
        this.watchIndex&& destroyComputed(this.watchIndex)
    }
}
