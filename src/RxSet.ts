import {ApplyPatchType, CallbacksType, computed, Computed, DirtyCallback, GetterType} from "./computed.js";
import {Atom} from "./atom.js";
import {ITERATE_KEY, Notifier, TriggerInfo} from "./notify.js";
import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
import {RxList} from "./RxList";

export class RxSet<T> extends Computed {
    data!: Set<T>
    trackClassInstance = true

    constructor(sourceOrGetter?: T[]|null|GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType) {
        const getter = typeof sourceOrGetter === 'function' ? sourceOrGetter : undefined
        const source = typeof sourceOrGetter !== 'function' ? sourceOrGetter : undefined

        // 自己可能是 computed，也可能是最初的 reactive
        super(getter, applyPatch, scheduleRecompute, callbacks, undefined, undefined)
        this.getter = getter

        // 自己是 source
        this.data = source instanceof Set ? source : new Set(Array.isArray(source) ? source : [])

        this.createComputedMetas()
        if (this.getter) {
            this.run([], true)
        }
    }
    replaceData(newData: T[]|Set<T>) {
        return this.replace(newData)
    }

    replace(newData: T[]|Set<T>): [T[], T[]]{
        const old = this.data
        this.data = newData instanceof Set ? newData : new Set(newData)

        const newItems: T[] = []
        const deletedItems: T[] = []

        old.forEach((value) => {
            if(!this.data.has(value)) {
                this.trigger(this, TriggerOpTypes.DELETE, { key: value, oldValue: value})
                deletedItems.push(value)
            }
        });

        [...newData].forEach((value) => {
            if(!old.has(value)) {
                this.trigger(this, TriggerOpTypes.ADD, { key: value, newValue: value})
                newItems.push(value)
            }
        })

        this.trigger(this, TriggerOpTypes.METHOD, { method: 'replace', argv: [newData], methodResult: [newItems, deletedItems]})
        this.sendTriggerInfos()
        return [newItems, deletedItems]
    }

    // 显式 set 某一个 index 的值
    add(value: T) {
        if (!this.data.has(value)) {
            this.data.add(value)
            this.trigger(this, TriggerOpTypes.ADD, { key: value, newValue: value})
            this.trigger(this, TriggerOpTypes.METHOD, { method: 'add', argv: [value]})
            this.sendTriggerInfos()
        }
        return this
    }
    clear() {
        return this.replace([])
    }
    delete(value:T) {
        if (this.data.has(value)) {
            this.data.delete(value)
            this.trigger(this, TriggerOpTypes.DELETE, { key: value, argv: [value]})
            this.trigger(this, TriggerOpTypes.METHOD, { method: 'delete', argv: [value]})
            this.sendTriggerInfos()
        }
        return this
    }
    has(value:T): Atom<boolean> {
        const base = this
        //  has 是 n(1) 的操作，所以不用 applyPatch 了。
        return computed(() => {
            Notifier.instance.track(base, TrackOpTypes.ITERATE, ITERATE_KEY)
            return base.data.has(value)
        })
    }
    // 在当前 set 里，但不在 other set 里
    difference(other: RxSet<T>): RxSet<T> {
        const base = this

        return new RxSet(
            function computation(this: RxSet<T>) {
                this.manualTrack(base, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(other, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return new Set([...base.data].filter(x => !other.data.has(x)))
            },
            function applyPatch(this: RxSet<T>, data:any, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach(({ methodResult, method, argv, newValue, source, result}) => {
                    let newItems: T[] = []
                    let deletedItems: T[] = []
                    if (method === 'add')  {
                        newItems = [argv![0]]
                    } else if (method === 'delete') {
                        deletedItems = [argv![0]]
                    } else {
                        // 只支持 replace method
                        [newItems, deletedItems] = methodResult as [T[], T[]]
                    }

                    if(source === base) {
                        newItems.forEach(x => {
                            if (!other.data.has(x)) {
                                this.add(x)
                            }
                        })

                        deletedItems.forEach(x => {
                            this.delete(x)
                        })
                    } else {
                        newItems.forEach(x => {
                            this.delete(x)
                        })

                        deletedItems.forEach(x => {
                            if(base.data.has(x)) {
                                this.add(x)
                            }
                        })
                    }
                })
            }
        )
    }
    intersection(other: RxSet<T>): RxSet<T> {
        const base = this

        return new RxSet(
            function computation(this: RxSet<T>) {
                this.manualTrack(base, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(other, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return new Set([...base.data].filter(x => other.data.has(x)))
            },
            function applyPatch(this: RxSet<T>, data:any, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach(({type, method, methodResult, argv, newValue, source, result}) => {
                    let newItems: T[] = []
                    let deletedItems: T[] = []
                    if (method === 'add')  {
                        newItems = [argv![0]]
                    } else if (method === 'delete') {
                        deletedItems = [argv![0]]
                    } else {
                        // 只支持 replace method
                        [newItems, deletedItems] = methodResult as [T[], T[]]
                    }

                    newItems.forEach(x => {
                        const toCheck = source === base ? other : base
                        if (toCheck.data.has(x)) {
                            this.add(x)
                        }
                    })

                    deletedItems.forEach(x => {
                        this.delete(x)
                    })
                })
            }
        )
    }
    // 差集
    symmetricDifference(other: RxSet<T>): RxSet<T> {
        const base = this

        return new RxSet(
            function computation(this: RxSet<T>) {
                this.manualTrack(base, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(other, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return new Set([...base.data].filter(x => !other.data.has(x)).concat([...other.data].filter(x => !base.data.has(x))))
            },
            function applyPatch(this: RxSet<T>, data:any, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach(({methodResult, method, argv, newValue, source, result}) => {
                    let newItems: T[] = []
                    let deletedItems: T[] = []
                    if (method === 'add')  {
                        newItems = [argv![0]]
                    } else if (method === 'delete') {
                        deletedItems = [argv![0]]
                    } else {
                        // 只支持 replace method
                        [newItems, deletedItems] = methodResult as [T[], T[]]
                    }

                    newItems.forEach(x => {
                        const toCheck = source === base ? other : base
                        if (!toCheck.data.has(x)) {
                            this.add(x)
                        } else {
                            this.delete(x)
                        }
                    })

                    deletedItems.forEach(x => {
                        const toCheck = source === base ? other : base
                        if (toCheck.data.has(x)) {
                            this.add(x)
                        } else {
                            this.delete(x)
                        }
                    })
                })
            }
        )
    }
    union(other: RxSet<T>): RxSet<T> {
        const base = this

        return new RxSet(
            function computation(this: RxSet<T>) {
                this.manualTrack(base, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                this.manualTrack(other, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return new Set([...base.data, ...other.data])
            },
            function applyPatch(this: RxSet<T>, data:any, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach(({methodResult, method, argv, newValue, source, result}) => {

                    let newItems: T[] = []
                    let deletedItems: T[] = []
                    if (method === 'add')  {
                        newItems = [argv![0]]
                    } else if (method === 'delete') {
                        deletedItems = [argv![0]]
                    } else {
                        // 只支持 replace method
                        [newItems, deletedItems] = methodResult as [T[], T[]]
                    }

                    newItems.forEach(x => {
                        this.add(x)
                    })

                    deletedItems.forEach(x => {
                        const toCheck = source === base ? other : base
                        if (!toCheck.data.has(x)) {
                            this.delete(x)
                        } else {
                        }
                    })
                })
            }
        )
    }

    isSubsetOf(other: RxSet<T>): Atom<boolean> {
        const base = this
        const intersection = this.intersection(other)

        return computed(() => {
            return intersection.size() === base.size()
        }, undefined, undefined, {
            onDestroy() {
                intersection.destroy()
            }
        })

    }
    isSupersetOf(other: RxSet<T>): Atom<boolean> {
        return other.isSubsetOf(this)
    }
    isDisjointFrom(other: RxSet<T>): Atom<boolean> {
        const intersection = this.intersection(other)
        return computed(() => {
            return intersection.size() === 0
        }, undefined, undefined, {
            onDestroy() {
                intersection.destroy()
            }
        })
    }
    forEach(handler: (item: T) => void) {
        this.data.forEach(handler)
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
    }
    toList(): RxList<T> {
        const base = this
        return new RxList(
            function computation(this: RxList<T>) {
                // 监听 ADD 和 DELETE type
                this.manualTrack(base, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return [...base.data]
            },
            function applyPatch(this: RxList<T>, data:any, triggerInfos: TriggerInfo[]) {
                triggerInfos.forEach(({methodResult, method, argv, newValue, source, result}) => {
                    let newItems: T[] = []
                    let deletedItems: T[] = []
                    if (method === 'add')  {
                        newItems = [argv![0]]
                    } else if (method === 'delete') {
                        deletedItems = [argv![0]]
                    } else {
                        // 只支持 replace method
                        [newItems, deletedItems] = methodResult as [T[], T[]]
                    }

                    newItems.forEach(x => {
                        this.push(x)
                    })

                    deletedItems.forEach(x => {
                        this.splice(this.data.indexOf(x), 1)
                    })
                })
            }
        )
    }
    toArray() {
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
        return [...this.data]
    }
    public size!: Atom<number>
    createComputedMetas() {
        // FIXME 目前不能用 cache 的方法在读时才创建。
        //  因为如果是在 autorun 等  computed 中读的，会导致在cleanup 时把
        //  相应的 computed 当做 children destroy 掉。
        const source = this
        this.size = computed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD)
                return source.data.size
            },
            function applyPatch(this: Computed, data: Atom<number>){
                data(source.data.size)
            }
        )
    }
}


