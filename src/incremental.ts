// 需要按原来的序，监听增删改
import {arrayComputed, computed, Computed, ComputedData, destroyComputed, mapComputed, setComputed} from "./computed";
import {TrackOpTypes, TriggerOpTypes} from "./operations";
import {Atom, atom, isAtom} from "./atom";
import {isReactive, UnwrapReactive} from "./reactive";
import {Notifier} from "./notify";
import {assert} from "./util";
import {ReactiveEffect} from "./reactiveEffect";


const atomIndexMap = new Map<any[], {depCount:number, computed?: ReturnType<typeof computed>, indexes: Atom<number>[]}>()

function getSpliceRemoveLength(argv: any[], length: number) : number {
    // CAUTION 按照 mdn 的定义，splice 第二个参数如果是 undefined 但是后面又有其他参数，就会被转成 0。
    const argv1NotUndefined = argv![1] === undefined ? ( argv!.length < 2 ? Infinity : 0 ) : (argv![1] as number)
    const argv1 = argv1NotUndefined < 0 ? 0 : argv1NotUndefined
    return argv1 !== Infinity ? argv1: (length - (argv![0] as number))
}


function getAtomIndexOfArray(source: any[]) {
    assert(Array.isArray(source), 'only array source can have atom indexes')
    let indexInfo = atomIndexMap.get(source)
    if (!indexInfo) {
        const indexes = source.map((i: any,index:number) => atom(index))
        indexInfo =  {
            depCount:0,
            indexes,
            computed: computed(
                function trackArrayMethod(this: Computed) {
                    this.manualTrack!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                },
                function applyAtomIndexChange(data, triggerInfos) {
                    triggerInfos.forEach(({ method , argv}) => {
                        assert(!!(method), 'trigger info has no method and result')

                        if (method === 'push') {
                            const newIndexes = argv!.map((i: any, index: number) => atom(index+indexes.length))
                            indexes.push(...newIndexes)
                        } else if (method === 'pop') {
                            indexes.pop()
                        } else if(method === 'shift') {
                            indexes.shift()
                        } else  if (method === 'unshift') {
                            indexes.forEach(indexAtom => indexAtom((origin: number) => origin + argv!.length))
                            indexes.unshift(...argv!.map((i:any, index) => atom(index)))
                        } else if (method === 'splice') {
                            const removeLength = getSpliceRemoveLength(argv!, indexes.length)
                            const newIndexes = argv!.slice(2)!.map((i:any, index) => atom(index + argv![0]))
                            indexes.splice(argv![0], argv![1], ...newIndexes)

                            // 如果不是刚好删除的等于新增的，那么就要重新计算后面的 index
                            if (removeLength !== newIndexes.length) {
                                for(let i = argv![0] + removeLength; i < indexes.length; i++) {
                                    indexes[i](i)
                                }
                            }

                        } else {
                            // 其他不用管了，mapFn 执行的时候会重新用新的 index 来获取对应的。
                        }
                    })
                },
                function onDirty(recompute) {
                    recompute()
                },
            )
        }

        atomIndexMap.set(source, indexInfo)
    }

    indexInfo.depCount++
    return indexInfo.indexes
}

function removeAtomIndexDep(source: any[]) {
    const indexInfo = atomIndexMap.get(source)!
    assert(!!indexInfo, 'no dep for this array source found.')
    indexInfo.depCount--
    if (indexInfo.depCount < 1) {
        destroyComputed(indexInfo.computed)
        atomIndexMap.delete(source)
    }
}


type PlainObject = {[k: string]: any}
// 监听增删改
// TODO
export function incIndexBy<T>(source: T[], propName: string|((arg0: T) => any), mapFn?: (arg: T) => any) {
    return computed(() => {
        const result = new Map<any, T>()
        source.forEach((item) => {
            const key = typeof propName === 'function' ? propName(item) : (item as PlainObject)[propName]
            result.set(key, mapFn ? mapFn(item) : item)
        })
        return result
    })
}


// 监听增删改
export function incMerge() {

}


// 需要结构有序，监听增删改
export function incSort() {

}

export function incBool() {

}

export function incFind() {

}

export function findIndex() {

}

// CAUTION incMap 是故意不考虑 source 中深层变化的，只关心数据本身的变化。所以在 mapFn 的时候读深层的对象不会硬气整个重算。
export function incMap<T>(source: T[], mapFn:(arg0: Atom<T>) => any) : UnwrapReactive<any[]>
export function incMap<T, U>(source: Map<U, T>, mapFn: (arg0:T, arg1:U) => any) : UnwrapReactive<Map<any, any>>
export function incMap<T>(source: Set<T>, mapFn: (arg0: T) => any) : UnwrapReactive<Set<any>>
export function incMap(source: ComputedData, mapFn: (...any: any[]) => any) {
    if (!isReactive(source)) {
        if (Array.isArray(source)) {
            // 注意这里为了和后面的数据结构保持一致，所以把  index 伪装成 atom
            return source.map((item, index) => mapFn(item, () => index))
        } else if (source instanceof Map){
            return new Map(Object.entries(source).map(([key, value]) => [key, mapFn(value, key)]))
        } else if (source instanceof Set) {
            return new Set(Array.from(source as Set<any>).map(mapFn))
        } else {
            assert(false, 'unknown source type for incMap')
        }
    }

    let cache: any

    // CAUTION 一定要放在这里，因为要比下面的 computed 先建立才会先计算，才能被下面的 computed 依赖。
    // CAUTION 因为 getAtomIndexOfArray 里面读了 source，会使得 track 泄露出去。所以一定要 pauseTracking
    let indexes:any
    if (mapFn.length>1) {
        Notifier.instance.pauseTracking()
        indexes = Array.isArray(source) ? getAtomIndexOfArray(source) : undefined
        Notifier.instance.resetTracking()
    }

    return Array.isArray(source) ?
        arrayComputed(
            function computation(this: Computed) {
                const { manualTrack: track, collectEffect: collect } = this
                track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                this.effectFramesArray = []

                // 用来收集新增和删除是产生的 effectFrames
                return source.map((item: any, index) => {
                    const getFrame = collect!()
                    // TODO 这里并没有针对 item 是数组/字符等的情况自动创建 leafAtom，未来会不会有需求？
                    //  目前好像没问题，因为如果是非对象情况，用户只能通过 [key]=? 来修改，这样会触发 EXPLICIT_KEY_CHANGE，然后重新计算。
                    //  只不过用户如果在这种情况下还想让 map 都不执行，而是获取更细力度的更新，那就暂时不行了。
                    const newItem = mapFn(item, indexes?.[index])
                    this.effectFramesArray![index] = getFrame() as ReactiveEffect[]
                    return newItem
                })
            },
            function applyMapArrayPatch(this: Computed, data, triggerInfos) {
                const {collectEffect: collect, destroyEffect: destroy} = this
                triggerInfos.forEach(({ method , argv, result, key, newValue   }) => {
                    assert(!!(method === 'splice' || result), 'trigger info has no method and result')
                    // Array
                    // 数组里面全部统一成了 splice
                    if (method === 'splice') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newItemsInArgs = argv!.slice(2)
                        const effectFrames: ReactiveEffect[][] = []
                        const newItems = newItemsInArgs.map((_, index) => {
                            const item = source[index+ argv![0]]
                            const getFrame = collect!()
                            const newItem = mapFn(item, indexes?.[index+ argv![0]])
                            effectFrames![index] = getFrame() as ReactiveEffect[]
                            return newItem
                        })
                        data.splice(argv![0], argv![1], ...newItems)
                        const deletedFrames = this.effectFramesArray!.splice(argv![0], argv![1], ...effectFrames)
                        deletedFrames.forEach((frame) => {
                            frame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    } else {
                        // CAUTION add/update 一定都要全部重新从 source 里面取，因为这样才能得到正确的 proxy。newValue 是 raw data，和 mapFn 里面预期拿到的不一致。
                        const index = key as number
                        const getFrame = collect!()
                        data[index] = mapFn(source[index], indexes?.[index])
                        const newFrame = getFrame() as ReactiveEffect[]
                        this.effectFramesArray![index].forEach((effect) => {
                            destroy(effect)
                        })
                        this.effectFramesArray![index] = newFrame
                    }
                })
            },
            true,
            {
                onDestroy() {
                    cache?.clear()
                    if (Array.isArray(source)&&mapFn.length>1) {
                        removeAtomIndexDep(source)
                    }
                }
            },
        ) : source instanceof Map ?
        mapComputed(
            function computation(this: Computed) {
                const { manualTrack: track, collectEffect: collect } = this
                track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                this.keyToEffectFrames = new WeakMap<any, ReactiveEffect[]>()

                return new Map(Array.from(source.entries()).map(([key, value]) => {
                    const getFrame = collect!()
                    const newItem = mapFn(value, key)
                    this.keyToEffectFrames!.set(key,  getFrame() as ReactiveEffect[])
                    return [key, newItem]
                }))

            },
            function applyMapArrayPatch(this: Computed, data, triggerInfos) {
                const {collectEffect: collect, destroyEffect: destroy} = this
                triggerInfos.forEach(({ method , argv, result, key, newValue   }) => {
                    assert(!!(method === 'splice' || result), 'trigger info has no method and result')

                        // TODO Map 的 map 中是否会读到 key?如果要读的话，会不会 key 也要  reactive 化？？？
                        if (method === 'clear') {
                            const keys = Array.from(data.keys())
                            data.clear()
                            keys.forEach((key) => {
                                const effectFrame = this.keyToEffectFrames!.get(key)!
                                effectFrame.forEach((effect) => {
                                    destroy(effect)
                                })
                            })
                        } else if (!method && result) {
                            // 没有 method 说明是 explicit_key_change 变化
                            result.add?.forEach(({ key, newValue }) => {
                                const getFrame = collect!()
                                data.set(key, mapFn(newValue))
                                const newFrame = getFrame() as ReactiveEffect[]
                                this.keyToEffectFrames!.set(key, newFrame)
                            })

                            result.update?.forEach(({ key, newValue }) => {
                                const getFrame = collect!()
                                data.set(key, mapFn(newValue))
                                const newFrame = getFrame() as ReactiveEffect[]
                                const originFrame = this.keyToEffectFrames!.get(key)!
                                originFrame.forEach((effect) => {
                                    destroy(effect)
                                })
                                this.keyToEffectFrames!.set(key, newFrame)
                            })

                            result.remove?.forEach(({ key }) => {
                                data.remove(key)
                                const effectFrame = this.keyToEffectFrames!.get(key)!
                                effectFrame.forEach((effect) => {
                                    destroy(effect)
                                })
                            })
                        }
                })
            },
            true,
            {
                onDestroy() {
                    cache?.clear()
                }
            },
            undefined,
        ):
        setComputed(
            function computation(this: Computed) {
                const { manualTrack: track, collectEffect: collect } = this
                track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                this.keyToEffectFrames = new WeakMap<any, ReactiveEffect[]>()
                // CAUTION 这里把每个元素都 atom 化了
                cache = new Map()
                const mappedData = Array.from(source.values()).map((value) => {
                    const getFrame = collect!()
                    const data = mapFn(value)
                    this.keyToEffectFrames!.set(value,  getFrame() as ReactiveEffect[])

                    cache.set(value, data)
                    return data
                })
                return new Set(mappedData)

            },
            function applyMapArrayPatch(this: Computed, data, triggerInfos) {
                const {collectEffect: collect, destroyEffect: destroy} = this
                triggerInfos.forEach(({ method , argv, result, key, newValue   }) => {
                    assert(!!(method === 'splice' || result), 'trigger info has no method and result')
                    if (method === 'clear') {
                        const values = Array.from(data.values())
                        data.clear()
                        values.forEach((value) => {
                            const effectFrame = this.keyToEffectFrames!.get(value)!
                            effectFrame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    } else if (!method && result) {
                        // 没有 method 说明是 explicit_key_change 变化
                        // CAUTION Set 是没有 update 变化的
                        result.add?.forEach(({ newValue }) => {
                            const getFrame = collect!()
                            data.add(mapFn(newValue))
                            const newFrame = getFrame() as ReactiveEffect[]
                            this.keyToEffectFrames!.set(newValue, newFrame)
                        })

                        result.remove?.forEach(({ oldValue }) => {
                            const mappedData = cache.get(oldValue)
                            data.remove(mappedData)
                            const effectFrame = this.keyToEffectFrames!.get(oldValue)!
                            effectFrame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    }
                })
            },
        true,
        {
            onDestroy() {
                cache?.clear()
            }
        },
    )
}

// TODO 也可以支持无序。也可以支持有序（元素全部是对象/元素非对象但不重复？）
export function incWeakMap() {

}


// TODO 要做 incremental 的话还要做每个元素的计数，才能处理 remove 的情况
export function incUnique(source: any[]) : UnwrapReactive<Set<any>>{
    return setComputed(() => {
        return new Set(source.map(item => {
            return isAtom(item) ? item() : item
        }))
    })
}
