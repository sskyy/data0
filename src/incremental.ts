// 需要按原来的序，监听增删改
import {computed, ComputedData, destroyComputed} from "./computed";
import {TrackOpTypes, TriggerOpTypes} from "./operations";
import {Atom, atom} from "./atom";


const atomIndexMap = new Map<any[], {depCount:number, computed?: ReturnType<typeof computed>, indexes: Atom<number>[]}>()

function getSpliceRemoveLength(argv: any[], length: number) : number {
    // CAUTION 按照 mdn 的定义，splice 第二个参数如果是 undefined 但是后面又有其他参数，就会被转成 0。
    const argv1NotUndefined = argv![1] === undefined ? ( argv!.length < 2 ? Infinity : 0 ) : (argv![1] as number)
    const argv1 = argv1NotUndefined < 0 ? 0 : argv1NotUndefined
    return argv1 !== Infinity ? argv1: (length - (argv![0] as number))
}

function getAtomIndexOfArray(source: any[]) {
    if (!Array.isArray(source)) throw new Error('only array source can have atom indexes')
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
                    triggerInfos.forEach(({ method , argv, result}) => {
                        if(!method && !result) throw new Error('trigger info has no method and result')

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
                            if (removeLength !== newIndexes.length) {
                                indexes.slice(argv![0] + removeLength).forEach(indexAtom => indexAtom((origin: number) => origin - removeLength + newIndexes.length))
                            }

                            // CAUTION 这里不能按照原本的 argv 去传递，因为 argv[1] 的"没传"和传"undefined"其实表现不同。
                            indexes.splice(argv![0], removeLength, ...newIndexes)
                        } else {
                            // 其他不管了
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
    const indexInfo = atomIndexMap.get(source)
    if (!indexInfo) throw new Error('no dep for this array source found.')
    indexInfo.depCount--
    if (indexInfo.depCount < 1) {
        destroyComputed(indexInfo.computed)
        atomIndexMap.delete(source)
    }
}


// 监听增删改
export function incIndexBy() {

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


export function incMap<T, U>(source: Map<U, T>, mapFn: (arg0:T, arg1:U) => any) : ReturnType<typeof computed>
export function incMap<T>(source: T[], mapFn:(arg0: Atom<T>) => any) : ReturnType<typeof computed>
export function incMap<T>(source: Set<T>, mapFn: (arg0: T) => any) : ReturnType<typeof computed>




export function incMap(source: ComputedData, mapFn: (...any: any[]) => any) {

    let cache: any
    // CAUTION 一定要放在这里，因为要比下面的 computed 先建立才会先计算，才能被下面的 computed 依赖。
    const indexes = Array.isArray(source) ? getAtomIndexOfArray(source) : undefined

    return computed(
        function computation(track) {
            // TODO 应该自动写了
            track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
            track!(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
            if (Array.isArray(source) ) {
                return source.map((item: any, index) => mapFn(item, indexes![index]))
            } else if (source instanceof Map) {
                return new Map(Array.from(source.entries()).map(([key, value]) => [key, mapFn(value)]))
            } else if (source instanceof Set) {
                // CAUTION 这里把每个元素都 atom 化了
                cache = new WeakMap()
                const mappedData = Array.from(source.values()).map((value) => {
                    const data = mapFn(value)
                    cache.set(value, data)
                    return data
                })
                return new Set(mappedData)
            } else {
                throw new Error('non-support map source type')
            }
        },
        function applyMapArrayPatch(data, triggerInfos) {
            triggerInfos.forEach(({ method , argv, result}) => {
                if(!method && !result) throw new Error('trigger info has no method and result')
                // Array
                if (Array.isArray(source)) {
                    // CAUTION indexes 应该已经准备好了
                    if (method === 'push') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newData = source.slice(source.length - argv!.length)!.map((item:any, index) => mapFn(item, indexes![index+data.length]))
                        data.push(...newData)
                    } else if (method === 'pop') {
                        data.pop()
                    } else if(method === 'shift') {
                        data.shift()
                    } else  if (method === 'unshift') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        data.unshift(...source.slice(0, argv!.length).map((item:any, index) => mapFn(item, indexes![index])))
                    } else if (method === 'splice') {
                        // CAUTION 这里重新从已经改变的  source 去读，才能重新被 reactive proxy 处理，和全量计算时收到的参数一样
                        const newItems = source.slice(argv![0], argv![0] + argv!.slice(2).length).map((item:any, index) => mapFn(item, indexes![index+ argv![0]]))
                        const removeLength = getSpliceRemoveLength(argv!, data.length)
                        data.splice(argv![0], removeLength, ...newItems)
                    } else if(!method && result){
                        // 没有 method 说明是 explicit_key_change 变化
                        result.add?.forEach(({ key, newValue }) => {
                            data[key] = mapFn(newValue, indexes![key])
                        })

                        result.update?.forEach(({ key, newValue }) => {
                            data[key] = mapFn(newValue, indexes![key])
                        })

                        result.remove?.forEach(({ key }) => {
                            delete data[key]
                        })
                    } else {
                        throw new Error('unknown trigger info')
                    }

                // Map
                } else if (source instanceof Map){
                    // TODO Map 的 map 中是否会读到 key?如果要读的话，会不会 key 也要  reactive 化？？？
                    if (method === 'clear') {
                        data.clear()
                    } else if (!method && result) {
                        // 没有 method 说明是 explicit_key_change 变化
                        result.add?.forEach(({ key, newValue }) => {
                            data.set(key, mapFn(newValue))
                        })

                        result.update?.forEach(({ key, newValue }) => {
                            data.set(key, mapFn(newValue))
                        })

                        result.remove?.forEach(({ key }) => {
                            data.remove(key)
                        })
                    }
                }  else if (source instanceof Set){
                    if (method === 'clear') {
                        data.clear()
                    } else if (!method && result) {
                        // 没有 method 说明是 explicit_key_change 变化
                        // CAUTION Set 是没有 update 变化的
                        result.add?.forEach(({ newValue }) => {
                            // TODO 要不要做重复性检查？？Set add 重复的东西进去会不会触发 trigger  add info??
                            data.add(mapFn(newValue))
                        })

                        result.remove?.forEach(({ oldValue }) => {
                            const mappedData = cache.get(oldValue)
                            data.remove(mappedData)
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
                removeAtomIndexDep(source)
            }
        }
    )
}

// TODO 也可以支持无序。也可以支持有序（元素全部是对象/元素非对象但不重复？）
export function incWeakMap() {

}





