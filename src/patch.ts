
import {trackCause, stopTrackCause, createTrackFrame} from "./effect";
import {
    clearCauses,
    collectCause,
    computed,
    ComputedInternal,
    destroyComputed,
    getCauses
} from "./computed";
import { Dep } from "./dep";

export type Cause = [Function, unknown[], unknown]


// n级索引，一级是 method，二级是 lazyComputed 对应的 this/参数, 三级是 lazyComputed, 四级是面的所有 patchFn
const patchFnsByMethod = new WeakMap()

let pausePatchPoint = false
export function disablePatch(fn: Function) {
    pausePatchPoint = true
    fn()
    pausePatchPoint = false
}

const afterPatchPointerFrames: Set<Function>[] = []

export function inAfterPatchPointerFrame() {
    return afterPatchPointerFrames.length !== 0
}

export function addAfterPatchPointerCallback( callback: Function) {
    afterPatchPointerFrames.at(-1)!.add(callback)
}

function enterAfterPatchPointerFrame() {
    afterPatchPointerFrames.push(new Set())
}

function exitAfterPatchPointerFrame() {
    return afterPatchPointerFrames.pop()
}



// CAUTION 一定要实现，不然可能有内存泄漏
// TODO 如果有个一个 lazyComputed，一直不读，那么cause 里存的 args 等信息就会一直堆积，产生类似于内存泄漏的问题。
export function patchPoint(fn: Function, indexNos?: any) {
    const patchedFn = function(this: unknown[], ...args: unknown[]) {
        if (pausePatchPoint) return fn()

        let relatedComputeds
        if (!indexNos) {
            relatedComputeds = patchFnsByMethod.get(patchedFn)?.get(this)?.keys()
        } else {
            const indexes = indexNos.map((i: any) => args[i])
            relatedComputeds = (getFromWeakMapTree(patchFnsByMethod, ([patchedFn]).concat(indexes)) as Map<any, any>)?.keys()
        }

        // 忽略在执行期间，数据变化对当前 lazyComputed 产生的 trigger。直接 set dirty. 并告知 引起变化的 Causes。
        const cause: Cause = [patchedFn, args, this]

        if (relatedComputeds) {
            for(let computed of relatedComputeds) {
                // console.log('collect cause', lazyComputed, cause)
                collectCause(computed, cause)
            }
        } else {
            // 这里可能是新建立的 reactive data，没有被任何 lazyComputed 依赖过，虽然有 patchPoint，但没有 relateComputed。
        }
        // 这个 trackCause 是因为 函数执行的时候还是会正常引起 effect 变换。effect 可以根据有没有这个值来判断是不是全部都能走 patch fn。
        trackCause(cause)
        // 为什么不在这里再去通知 lazyComputed? 因为 fn.apply 里面可能会触发能多次通知，但其实都是因为这同一次操作引起的。

        // 这个 frame 是用来记录 fn.apply 中产生的要立刻重新计算 lazyComputed 的需求的，要延迟到 fn 执行完了之后再执行。因为它通常需要依赖 fn 的计算结果（cause 里）。
        enterAfterPatchPointerFrame()
        const patchPointResult = fn.apply(this, args)
        const frameCallbacks = exitAfterPatchPointerFrame()!
        // if (patchPointResult.added && !patchPteraointResult.added?.from.next) debugger
        // 这里记录下是因为在处理 iterate 对象时可能需要根据 return 值来判断到底哪些节点丢掉了不需要要track，哪些是新增的。
        cause.push(patchPointResult)
        frameCallbacks.forEach(callback => callback())
        stopTrackCause()

        return patchPointResult
    }

    patchedFn.indexNos = indexNos
    patchedFn.origin = fn

    return patchedFn
}


// TODO 对 set 的监听？？？
export function registerPatchFns(computedInternal: ComputedInternal, registerPatchFnsOnComputed: Function) {
    const effect = computedInternal.effect
    // 注册要监听的 patchPoint
    function on(patchPoint: Function, indexes: any, patchFn: Function) {
        const computedToPatchFn = getFromWeakMapTree(patchFnsByMethod, ([patchPoint]).concat(indexes), () =>  new Map())
        computedToPatchFn.set(computedInternal.computed, patchFn)
    }

    // 把 fn 执行中的所有 dep 都增量收集到当前的 this.Computed 上
    function addTrack(fn: Function) {
        console.log(999)
        // 此时肯定已经是在当前 lazyComputed 重新 run 的过程中了，直接执行函数收集就行
        if(!effect.patchMode) throw new Error('not in patch mode')
        fn()
    }

    function untrack(deps: Dep[]) {
        console.log(222, deps)
        effect.untrack(deps)
    }

    // 注册一下所有的 patchFn
    registerPatchFnsOnComputed({ on, addTrack, untrack })

    // 当重新计算 thisComputed 的时候，thisComputed 会根据当前能不能走 patch 来决定是否调用 applyPatch。
    return function applyPatch(lastResult: any) {
        getCauses(computedInternal.computed)?.forEach(([patchPoint, argv, target, patchPointResult] : [PatchPoint, any[], any, any]) => {
            // 方法没有指定 indexNos，说明这是某个对象的方法，直接用对象做索引的，这是和上面的约定。
            const indexes = patchPoint.indexNos?.map((no: any) => argv[no]) || [target]
            const callback = getFromWeakMapTree(patchFnsByMethod, ([patchPoint]).concat(indexes))?.get(computedInternal.computed)
            callback(argv, lastResult, patchPointResult)
        })

        // 消耗掉 causes
        clearCauses(computedInternal.computed)
    }
}

type PatchPoint = Function & { indexNos: number[] }

function getFromWeakMapTree(root: WeakMap<any, any>, indexes: any[], createDefault?: any) {
    let base = root
    indexes.every((argIndex: any, num) => {
        let next = base.get(argIndex)
        if (!next && createDefault) {
            next = (num === indexes.length - 1) ? createDefault() : new WeakMap()
            base.set(argIndex, next)
        }
        base = next
        return !!base
    })
    return base
}


interface CollectionType {
    iterator(from: any, to: any) : { next: () => { value: any, done : boolean} }
    constructor: Function & { iterate:(from: any, to: any, untrack: (item: any) => void ) => any}
}

/**
 * 针对 collection 的 forEach 和 map lazyComputed 的 patch utils。
 * 自动进行了新增节点和删除节点的 track/untrack
 *
 * 如果是自定义对象，要求对象必须实现 iterate(start, end) 方法。用来实现新增 track。
 * 要求所有 mutate 方法必须告诉框架新插入的节点是？删除的节点是？这样才能做到 track/untrack。
 */
function iterateWithTrackInfo(collection: CollectionType, fromTo : [any?, any?], handle: Function, trackInfoCallback: Function, prev?: any) {
    const trackFrame = createTrackFrame()

    const { next } = collection.iterator(fromTo[0], fromTo[1])
    let iterateDone = false
    let prevItem: any = prev
    while(!iterateDone) {
        trackFrame.start()
        let { value: item, done} = next()
        // 可能一上来就是 done，这时 value 是 undefined
        if(item !== undefined) {
            handle(item, prevItem)
            trackInfoCallback(item, trackFrame.end())
        } else {
            trackFrame.end()
        }
        iterateDone = done
        prevItem = item
    }
}


type PatchPointResult = {
    added? : {
        from? : Object,
        to? : Object,
    },
    // 当有 added 的时候，通常会要说明 add 的节点在哪个后面
    after?: Object,
    removed? : {
        from? : Object,
        to? : Object,
    }
}

// TODO 改成自动根据 collection class 哪些 method 是 patchPoints 来 patch
/**
 * 当 collection 发生增删的变化时，增量执行  handle 和 handleRemove 函数.
 * 我们的 computed 也能支持 lazy，所以用户可以自定义 schedule 函数接受 dirty 信号。
 * @param collection
 * @param patchPoints
 * @param handle
 * @param handleRemoved
 * @param schedule
 * @param callbacks
 */
export function autoForEach(collection: CollectionType, patchPoints = [], handle: Function, handleRemoved: Function, schedule: Function, callbacks = {}) {
    const itemToTrackDeps = new WeakMap()
    const trackInfoCallback = (item: Object, deps: Dep[]) => itemToTrackDeps.set(item, deps)

    const result = computed(function createAutoForEach() {
        iterateWithTrackInfo(collection, [], handle, trackInfoCallback)
        return {
            collection,
        }
    }, ({ on, addTrack, untrack }) => {
        // 自动找就行了
        patchPoints.forEach(patchPoint => {
            on(patchPoint, [collection], (argv: any[], lastResult: any, patchPointResult: PatchPointResult) => {
                // 自动 track/untrack。这里要求这个 patchPoint 执行完 mutate 之后必须告诉外部新增和删除的节点？
                // 任何 patchPointMutate 方法必须返回 { added: {from: to}, removed: {from, to}}
                if (patchPointResult?.added) {
                    addTrack(() => iterateWithTrackInfo(collection, [patchPointResult?.added!.from, patchPointResult?.added!.to], handle, trackInfoCallback, patchPointResult?.after))
                }

                if (patchPointResult?.removed) {
                    // 注意这里，因为 iterator 是从第一个参数的 next 读起的，不会读第一个参数，所以要这样处理。
                    const removeStart = { next: patchPointResult.removed.from }
                    collection.constructor.iterate(removeStart, patchPointResult.removed.to, (item: any) => {
                        handleRemoved(item)
                        if (!itemToTrackDeps.get(item)) debugger
                        untrack(itemToTrackDeps.get(item))
                    })
                }
            })
        })
    }, (immediateUpdate: Function) => {
        schedule && schedule(immediateUpdate)
    }, callbacks)

    return function stop() {
        destroyComputed(result)
    }
}

export function collectionPatchPoint(method: Function, indexNos: any) {
    const result = patchPoint(method, indexNos)
    // @ts-ignore
    result.isCollectionPatchPoint = true
    return result
}


// TODO mapComputed 针对数组、对象等，也是自动 patch
export function mapComputed(collection: any) {

}




