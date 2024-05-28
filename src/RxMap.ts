import {
    ApplyPatchType,
    atomComputed,
    CallbacksType,
    Computed,
    DirtyCallback,
    GetterType,
    SkipIndicator
} from "./computed.js";
import {ITERATE_KEY, Notifier} from "./notify.js";
import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
import {Atom} from "./atom.js";
import {RxList} from "./RxList.js";
import {assert, isMap} from "./util.js";

type EntryType = [any, any][]
type PlainObjectType = {
    [key: string]: any
}

export class RxMap<K, V> extends Computed{
    data!: Map<K, V>
    trackClassInstance = true
    constructor(sourceOrGetter: EntryType|PlainObjectType|null|GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType, public skipIndicator? : SkipIndicator, public forceAtom?: boolean) {
        const getter = typeof sourceOrGetter === 'function' ? sourceOrGetter as GetterType : undefined
        const source = typeof sourceOrGetter === 'function' ? undefined : sourceOrGetter
        // 自己可能是 computed，也可能是最初的 reactive
        super(getter, applyPatch, scheduleRecompute, callbacks, skipIndicator, forceAtom)
        this.getter = getter
        // 自己是 source
        if (source) {
            this.data = isMap(source) ? source : new Map(Array.isArray(source) ? source : Object.entries(source))
        } else {
            this.data = new Map()
        }

        if (this.getter) {
            this.runEffect()
        }
    }
    replace = (source: EntryType|PlainObjectType|Map<K,V>) => {
        let entries: EntryType
        if (source instanceof Map) {
            this.data = source
            entries = Array.from(source.entries())
        } else {
            this.data.clear()
            entries = Array.isArray(source) ? source : Object.entries(source)
            this.data = new Map(entries)
        }

        entries.forEach(([key, value]) => {
            Notifier.instance.trigger(this, TriggerOpTypes.ADD, { key, newValue: value})
        })
        Notifier.instance.trigger(this, TriggerOpTypes.METHOD, {method: 'replace', argv: [source]})
    }
    replaceData = this.replace

    // set methods
    set(key: K, value: V) {
        const hasValue = this.data.has(key)
        const oldValue = this.data.get(key)
        this.data.set(key, value)
        if (hasValue) {
            Notifier.instance.trigger(this, TriggerOpTypes.SET, { key, newValue: value, oldValue})
        } else {
            Notifier.instance.trigger(this, TriggerOpTypes.ADD, { key, newValue: value})
        }
    }

    delete(key: K) {
        const hasValue = this.data.has(key)
        if (hasValue) {
            const oldValue = this.data.get(key)
            this.data.delete(key)
            Notifier.instance.trigger(this, TriggerOpTypes.DELETE, { key, newValue: undefined, oldValue})
        }
    }

    clear() {
        const entries = Array.from(this.data.entries())
        this.data.clear()
        entries.forEach(([key, value]) => {
            Notifier.instance.trigger(this, TriggerOpTypes.DELETE, { key,  oldValue: value})
        })
        Notifier.instance.trigger(this, TriggerOpTypes.METHOD, { method: 'clear'})
    }

    // track methods
    get(key: K) {
        const value = this.data.get(key)
        Notifier.instance.track(this, TrackOpTypes.GET, key)
        return value
    }
    forEach(handler: (item: V, index: K) => void) {
        for(let [key, value ] of this.data) {
            handler(value!, key)
        }
        // track iterator
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
    }
    [Symbol.iterator]() {
        let index = 0;
        let data = this.data;
        // track length
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)
        const keys = Array.from(data.keys())
        return {
            next: () => {
                if (index < keys.length) {
                    // 转发到 at 上实现 track index
                    const value = this.get(keys[index])
                    return { value: [value, keys[index]], done: false };
                } else {
                    return { done: true };
                }
            }
        };
    }

    // reactive methods
    entries(): RxList<[K, V]> {
        const source = this
        const keys: K[] = []

        return new RxList<[K, V]>(
            function computation(this: RxList<[K, V]>) {
                this.manualTrack(source, TrackOpTypes.ITERATE, ITERATE_KEY);
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);

                keys.push(...source.data.keys())

                return Array.from(source.data.entries()) as [K, V][]
            },
            function applyPatch(this: RxList<[K, V]>, data: Atom<EntryType>, triggerInfos){
                triggerInfos.forEach(info => {
                    if (info.type === TriggerOpTypes.METHOD) {
                        if (info.method === 'clear') {
                            this.splice(0, this.data.length)
                            keys.splice(0, keys.length)
                        }else {
                            assert(false, 'unreachable')
                        }
                    } else {
                        const newKey = info.key as K
                        const newValue = info.newValue as V
                        if (info.type === TriggerOpTypes.ADD) {
                            this.push([newKey, newValue])
                            keys.push(newKey)
                        } else if (info.type === TriggerOpTypes.SET) {
                            const index = keys.indexOf(newKey)
                            this.set(index, [newKey, newValue])
                        } else if (info.type === TriggerOpTypes.DELETE) {
                            const index = keys.indexOf(newKey)
                            this.splice(index, 1)
                            keys.splice(index, 1)
                        }else {
                            assert(false, 'unreachable')
                        }
                    }


                })
            }
        )
    }
    values() {
        const source = this
        return new RxList<V>(
            function computation(this: RxList<V>) {
                this.manualTrack(source, TrackOpTypes.ITERATE, ITERATE_KEY);
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);

                return Array.from(source.data.values())
            },
            function applyPatch(this: RxList<V>, data: Atom<V[]>, triggerInfos){
                triggerInfos.forEach(info => {
                    if (info.type === TriggerOpTypes.METHOD) {
                        if (info.method === 'clear') {
                            this.splice(0, this.data.length)
                        }else {
                            assert(false, 'unreachable')
                        }
                    } else {
                        if (info.type === TriggerOpTypes.ADD) {
                            this.push(info.newValue as V)
                        } else if (info.type === TriggerOpTypes.SET) {
                            const index = this.data.indexOf(info.oldValue as V)
                            this.splice(index, 1, info.newValue as V)
                        } else if (info.type === TriggerOpTypes.DELETE) {
                            const index = this.data.indexOf(info.oldValue as V)
                            this.splice(index, 1)
                        }else {
                            assert(false, 'unreachable')
                        }
                    }
                })
            }
        )
    }
    keys() {
        const source = this
        return new RxList<K>(
            function computation(this: RxList<K>) {
                this.manualTrack(source, TrackOpTypes.ITERATE, ITERATE_KEY);
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);

                return Array.from(source.data.keys())
            },
            function applyPatch(this: RxList<K>, data: Atom<K[]>, triggerInfos){
                triggerInfos.forEach(info => {
                    if (info.type === TriggerOpTypes.METHOD) {
                        if (info.method === 'clear') {
                            this.splice(0, this.data.length)
                        }else {
                            assert(false, 'unreachable')
                        }
                    } else {
                        const newKey = info.key as K
                        if (info.type === TriggerOpTypes.ADD) {
                            this.push(newKey)
                        } else if (info.type === TriggerOpTypes.SET) {

                        } else if (info.type === TriggerOpTypes.DELETE) {
                            const index = this.data.indexOf(newKey)
                            this.splice(index, 1)
                        } else {
                            assert(false, 'unreachable')
                        }
                    }

                })
            }
        )
    }
    get size() {
        const source = this
        return atomComputed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.ITERATE, ITERATE_KEY)
                return source.data.size
            },
            function applyPatch(this: Computed, data: Atom<number>, triggerInfos){
                data(source.data.size)
            }
        )
    }
}