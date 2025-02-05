import {
    ApplyPatchType,
    CallbacksType,
    computed,
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
/**
 * @category Basic
 */
export class RxMap<K, V> extends Computed{
    data!: Map<K, V>
    trackClassInstance = true
    constructor(sourceOrGetter?: EntryType|PlainObjectType|null|GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType, public skipIndicator? : SkipIndicator, public forceAtom?: boolean) {
        const getter = typeof sourceOrGetter === 'function' ? sourceOrGetter as GetterType : undefined
        const source = typeof sourceOrGetter === 'function' ? undefined : sourceOrGetter
        // 自己可能是 computed，也可能是最初的 reactive
        super(getter, applyPatch, scheduleRecompute, callbacks, skipIndicator, 'map')
        this.getter = getter
        // 自己是 source
        if (source) {
            this.data = isMap(source) ? source : new Map(Array.isArray(source) ? source : Object.entries(source))
        } else {
            this.data = new Map()
        }

        if (this.getter) {
            this.run([], true)
        }
        this.createComputedMetas()
    }
    replace = (source: EntryType|PlainObjectType|Map<K,V>) => {
        let entries: EntryType

        const oldKeys = new Set(this.data.keys())
        if (source instanceof Map) {
            entries = Array.from(source.entries())
        } else {
            entries = Array.isArray(source) ? source : Object.entries(source)
        }

        entries.forEach(([key, value]) => {
            const hasValue = this.data.has(key)
            this.data.set(key, value)
            if (hasValue) {
                this.trigger(this, TriggerOpTypes.SET, { key, newValue: value})
            } else {
                this.trigger(this, TriggerOpTypes.ADD, { key, newValue: value})
            }
            oldKeys.delete(key)
        })

        const deleteEntries: [K, V][] = []
        oldKeys.forEach((key, value) => {
            const oldValue = this.data.get(key)!
            this.data.delete(key)
            this.trigger(this, TriggerOpTypes.DELETE, { key, oldValue})
            deleteEntries.push([key, oldValue])
        })

        this.trigger(this, TriggerOpTypes.METHOD, {method: 'replace', argv: [source], methodResult: deleteEntries})
        this.sendTriggerInfos()
    }
    replaceData = this.replace

    // set methods
    set(key: K, value: V) {
        const hasValue = this.data.has(key)
        const oldValue = this.data.get(key)
        this.data.set(key, value)
        if (hasValue) {
            if (value === oldValue) return

            this.trigger(this, TriggerOpTypes.SET, { key, newValue: value, oldValue})
        } else {
            this.trigger(this, TriggerOpTypes.ADD, { key, newValue: value})
        }
        this.trigger(this, TriggerOpTypes.METHOD, { method: 'set', argv: [key, value], methodResult: [hasValue, oldValue]})

        this.sendTriggerInfos()
    }

    delete(key: K) {
        const hasValue = this.data.has(key)
        let oldValue:V|undefined
        if (hasValue) {
            oldValue = this.data.get(key)
            this.data.delete(key)
            this.trigger(this, TriggerOpTypes.DELETE, { key, newValue: undefined, oldValue})

            this.trigger(this, TriggerOpTypes.METHOD, { method: 'delete', argv: [key], methodResult: oldValue})

            this.sendTriggerInfos()
        }
    }

    clear() {
        const entries = Array.from(this.data.entries())
        this.data.clear()
        entries.forEach(([key, value]) => {
            this.trigger(this, TriggerOpTypes.DELETE, { key,  oldValue: value})
        })
        this.trigger(this, TriggerOpTypes.METHOD, { method: 'clear', methodResult: entries})
        this.sendTriggerInfos()
    }

    // track methods
    get(key: K) {
        // 先执行 track 才会触发 recompute
        Notifier.instance.track(this, TrackOpTypes.GET, key)
        return this.data.get(key)
    }
    forEach(handler: (item: V, index: K) => void) {
        Notifier.instance.track(this, TrackOpTypes.ITERATE, ITERATE_KEY)

        for(let [key, value ] of this.data) {
            handler(value!, key)
        }
        // track iterator
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
    public keys!: () => RxList<K>
    public entries!: () => RxList<[K, V]>
    public values!: () => RxList<V>
    public size!: Atom<number>
    createComputedMetas() {
        // FIXME 目前不能用 cache 的方法在读时才创建。
        //  因为如果是在 autorun 等  computed 中读的，会导致在cleanup 时把
        //  相应的 computed 当做 children destroy 掉。

        const source = this
        const keys = new RxList<K>(
            function computation(this: RxList<K>) {
                this.manualTrack(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                return Array.from(source.data.keys())
            },
            function applyPatch(this: RxList<K>, data: Atom<K[]>, triggerInfos){
                for(let info of triggerInfos) {
                    if (info.type === TriggerOpTypes.METHOD) {
                        if (info.method === 'clear' || info.method === 'replace') {
                            return false
                        } else if (info.method === 'set') {
                            const [hasValue] = info.methodResult as [boolean, V]
                            if (!hasValue) {
                                this.push(info.argv![0]! as K)
                            }
                        } else if(info.method === 'delete') {
                            const index = this.data.indexOf(info.argv![0] as K)
                            this.splice(index, 1)
                        } else {
                            assert(false, 'unreachable')
                        }
                    } else {
                        assert(false, 'unreachable')
                    }
                }
            }
        )
        this.keys = () => keys

        const values = this.keys().map(key => this.get(key)!)
        this.values = () => values

        const entries = this.keys().map(key => [key, this.get(key)] as [K, V])
        this.entries = () => entries


        this.size = computed(
            function computation(this: Computed) {
                this.manualTrack(source, TrackOpTypes.ITERATE, ITERATE_KEY)
                return source.data.size
            },
            function applyPatch(this: Computed, data: Atom<number>, triggerInfos) {
                data(source.data.size)
            }
        )
    }
}