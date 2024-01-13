// 需要按原来的序，监听增删改
import {computed, ComputedData, destroyComputed} from "./computed";
import {TrackOpTypes, TriggerOpTypes} from "./operations";
import {Atom, atom, isAtom} from "./atom";
import {isReactive} from "./reactive";
import { Notifier} from "./notify";
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
                function trackArrayMethod(track) {
                    track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
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

// 监听增删改
export function incBool() {

}

export function findIndex() {

}


export function incMap<T>(source: T[], mapFn:(arg0: Atom<T>, index?:Atom<number>) => any) : ReturnType<typeof computed>
export function incMap<T, U>(source: Map<U, T>, mapFn: (arg0:T, arg1:U) => any) : ReturnType<typeof computed>
export function incMap<T>(source: Set<T>, mapFn: (arg0: T) => any) : ReturnType<typeof computed>


// CAUTION incMap 是故意不考虑 source 中深层变化的，只关心数据本身的变化。所以在 mapFn 的时候读深层的对象不会硬气整个重算。
// FIXME 需要收集用户在 mapFn 中建立的 innerComputed，并且在相应 item remove 的时候，在 applyPatch 函数中 return 出来，
//  这样才会被外部 destroy 掉，否则永远只会记录新增的，不会 destroy 删除的。
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

    const effectFramesArray: ReactiveEffect[][]|undefined = Array.isArray(source) ? [] : undefined
    const keyToEffectFrames = new WeakMap<any, ReactiveEffect[]>()

    let cache: any

    // CAUTION 一定要放在这里，因为要比下面的 computed 先建立才会先计算，才能被下面的 computed 依赖。
    // CAUTION 因为 getAtomIndexOfArray 里面读了 source，会使得 track 泄露出去。所以一定要 pauseTracking
    let indexes:any
    if (mapFn.length>1) {
        Notifier.instance.pauseTracking()
        indexes = Array.isArray(source) ? getAtomIndexOfArray(source) : undefined
        Notifier.instance.resetTracking()
    }
    return computed(
        function computation(track,  collect) {
            track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
            track!(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
            if (Array.isArray(source) ) {
                return source.map((item: any, index) => {
                    const getFrame = collect!()
                    const newItem = mapFn(item, indexes?.[index])
                    effectFramesArray![index] = getFrame()
                    return newItem
                })
            } else if (source instanceof Map) {
                return new Map(Array.from(source.entries()).map(([key, value]) => {
                    const getFrame = collect!()
                    const newItem = mapFn(value, key)
                    keyToEffectFrames.set(key,  getFrame())
                    return [key, newItem]
                }))
            } else if (source instanceof Set) {
                // CAUTION 这里把每个元素都 atom 化了
                cache = new Map()
                const mappedData = Array.from(source.values()).map((value) => {
                    const getFrame = collect!()
                    const data = mapFn(value)
                    keyToEffectFrames.set(value,  getFrame())

                    cache.set(value, data)
                    return data
                })
                return new Set(mappedData)
            } else {
                assert(false, 'non-support map source type')
            }
        },
        function applyMapArrayPatch(data, triggerInfos, { destroy, collect }) {
            triggerInfos.forEach(({ method , argv, result   }) => {
                assert(!!(method || result), 'trigger info has no method and result')
                // Array
                if (Array.isArray(source)) {
                    // CAUTION indexes 应该已经准备好了
                    if (method === 'push') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        // const newData = source.slice(source.length - argv!.length)!.map((item:any, index) => mapFn(item, indexes?.[index+data.length]))
                        const dataLength = data.length
                        const effectFrames: ReactiveEffect[][] = []

                        const newData = argv!.map((_, index) => {
                            const item = source[dataLength+index]
                            const getFrame = collect!()
                            const newItem = mapFn(item, indexes?.[dataLength+index])
                            effectFrames.push(getFrame())
                            return newItem
                        })
                        data.push(...newData)
                        effectFramesArray!.push(...effectFrames)
                    } else if (method === 'pop') {
                        data.pop()
                        const effectFrame = effectFramesArray!.pop()!
                        effectFrame.forEach((effect) => {
                            destroy(effect)
                        })
                    } else if(method === 'shift') {
                        data.shift()
                        const effectFrame = effectFramesArray!.shift()!
                        effectFrame.forEach((effect) => {
                            destroy(effect)
                        })
                    } else  if (method === 'unshift') {
                        const effectFrames: ReactiveEffect[][] = []
                        const newData = argv!.map((_, index) => {
                            const item = source[index]
                            const getFrame = collect!()
                            const newItem = mapFn(item, indexes?.[index])
                            effectFrames.push(getFrame())
                            return newItem
                        })
                        data.unshift(...newData)
                        effectFramesArray!.unshift(...effectFrames)
                    } else if (method === 'splice') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newItemsInArgs = argv!.slice(2)
                        const effectFrames: ReactiveEffect[][] = []
                        const newItems = newItemsInArgs.map((_, index) => {
                            const item = source[index+ argv![0]]
                            const getFrame = collect!()
                            const newItem = mapFn(item, indexes?.[index+ argv![0]])
                            effectFrames![index] = getFrame()
                            return newItem
                        })
                        data.splice(argv![0], argv![1], ...newItems)
                        const deletedFrames = effectFramesArray!.splice(argv![0], argv![1], ...effectFrames)
                        deletedFrames.forEach((frame) => {
                            frame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    } else if(!method && result){
                        // CAUTION add/update 一定都要全部重新从 source 里面取，因为这样才能得到正确的 proxy。newValue 是 raw data，和 mapFn 里面预期拿到的不一致。
                        // 没有 method 说明是 explicit_key_change 变化
                        result.add?.forEach(({ key }) => {
                            const getFrame = collect!()
                            data[key] = mapFn(source[key], indexes?.[key])
                            const newFrame = getFrame()
                            effectFramesArray![key].forEach((effect) => {
                                destroy(effect)
                            })
                            effectFramesArray![key] = newFrame
                        })

                        result.update?.forEach(({ key }) => {
                            const getFrame = collect!()
                            data[key] = mapFn(source[key], indexes?.[key])
                            const newFrame = getFrame()
                            effectFramesArray![key].forEach((effect) => {
                                destroy(effect)
                            })
                            effectFramesArray![key] = newFrame
                        })

                        result.remove?.forEach(({ key }) => {
                            data.splice(key, 1)
                            const effectFrame = effectFramesArray!.splice(key, 1)[0]
                            effectFrame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    } else {
                        assert(false, 'unknown trigger info')
                    }

                // Map
                } else if (source instanceof Map){
                    // TODO Map 的 map 中是否会读到 key?如果要读的话，会不会 key 也要  reactive 化？？？
                    if (method === 'clear') {
                        const keys = Array.from(data.keys())
                        data.clear()
                        keys.forEach((key) => {
                            const effectFrame = keyToEffectFrames.get(key)!
                            effectFrame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    } else if (!method && result) {
                        // 没有 method 说明是 explicit_key_change 变化
                        result.add?.forEach(({ key, newValue }) => {
                            const getFrame = collect!()
                            data.set(key, mapFn(newValue))
                            const newFrame = getFrame()
                            keyToEffectFrames.set(key, newFrame)
                        })

                        result.update?.forEach(({ key, newValue }) => {
                            const getFrame = collect!()
                            data.set(key, mapFn(newValue))
                            const newFrame = getFrame()
                            const originFrame = keyToEffectFrames.get(key)!
                            originFrame.forEach((effect) => {
                                destroy(effect)
                            })
                            keyToEffectFrames.set(key, newFrame)
                        })

                        result.remove?.forEach(({ key }) => {
                            data.remove(key)
                            const effectFrame = keyToEffectFrames.get(key)!
                            effectFrame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    }
                }  else if (source instanceof Set){
                    if (method === 'clear') {
                        const values = Array.from(data.values())
                        data.clear()
                        values.forEach((value) => {
                            const effectFrame = keyToEffectFrames.get(value)!
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
                            const newFrame = getFrame()
                            keyToEffectFrames.set(newValue, newFrame)
                        })

                        result.remove?.forEach(({ oldValue }) => {
                            const mappedData = cache.get(oldValue)
                            data.remove(mappedData)
                            const effectFrame = keyToEffectFrames.get(oldValue)!
                            effectFrame.forEach((effect) => {
                                destroy(effect)
                            })
                        })
                    }
                }
            })
        },
        // TODO 外部决定
        function onDirty(recompute) {
            recompute()
        },
        {
            onDestroy() {
                cache?.clear()
                if (mapFn.length>1) {
                    removeAtomIndexDep(source)
                }
            }
        }
    )
}

// TODO 也可以支持无序。也可以支持有序（元素全部是对象/元素非对象但不重复？）
export function incWeakMap() {

}



// TODO 要做 incremental 的话还要做每个元素的计数，才能处理 remove 的情况
export function incUnique(source: any[]) : ReturnType<typeof computed>{
    return computed(() => {
        return new Set(source.map(item => {
            return isAtom(item) ? item() : item
        }))
    })
}


// TODO pick 所有对象的指定属性，相当于封装的 incMap
export function incPick(source: any[], propName: string) : ReturnType<typeof computed>{
    return incMap(source, (item) => item[propName])
}

// TODO
type AssertFn = (item: any, index: number) => boolean
export function incEvery(source: Set<any>, assert: AssertFn) : ReturnType<typeof computed>
export function incEvery(source: any[], assert: AssertFn) : ReturnType<typeof computed>
export function incEvery(source: any, assert: AssertFn) : ReturnType<typeof computed>{
    const arr = Array.isArray(source) ? source : Array.from(source)
    return computed(() => arr.every(assert))

}

export function incSome(source: any[], assert:AssertFn) : ReturnType<typeof computed>{
    return computed(() => source.some(assert))
}

// 单选的增量计算
export function incUniqueMatch(initialValue?: any) {
    let lastValue = initialValue
    const value = atom(initialValue)
    const indexMap = new WeakMap<any, any>()

    function match(valueToMatch: any) {
        const matched = atom(valueToMatch === value())
        indexMap.set(valueToMatch, matched)
        return matched
    }

    const watcher = computed(() => {
        const lastMatchedItem = indexMap.get(lastValue)
        const thisValue = value()
        lastValue = thisValue
        const thisMatchedItem = indexMap.get(thisValue)
        if (lastMatchedItem && lastMatchedItem !== thisMatchedItem) {
            lastMatchedItem(false)
        }

        if (thisMatchedItem) thisMatchedItem(true)
    })

    return [value, match, watcher]
}

// TODO 多选
export function incMatch() {

}

export function incFilter(source: any[], filterFn: (item:any) => boolean) {
    return computed(() => {
        return source.filter(filterFn)
    })
}

// TODO
export function incConcat(arr1: any[], ...arr: any[][]) {
    return arr1.concat(...arr)
}