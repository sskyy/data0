import {ApplyPatchType, CallbacksType, Computed, DirtyCallback, GetterType} from "./computed.js";
import {Atom} from "./atom.js";
import {Dep} from "./dep.js";
import {InputTriggerInfo, Notifier, TriggerInfo} from "./notify.js";
import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
import {assert} from "./util.js";
import {ReactiveEffect} from "./reactiveEffect.js";

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

        const result = this.data.splice(start, deleteCount, ...items)

        if (deleteItemsCount !== items.length) {
            Notifier.instance.trigger(this, TriggerOpTypes.SET, { key: 'length', newValue: this.data.length})
        }

        const changedIndexEnd = deleteItemsCount !== items.length ? this.data.length : start + items.length
        if (this.indexKeyDeps.size > 0){
            // 手动查找 dep 和触发，这样效率更高
            for (let i = start; i < changedIndexEnd; i++) {
                const dep = this.indexKeyDeps.get(i)!
                Notifier.instance.triggerEffects(dep, {source: this, key: i, newValue: this.data[i]})
            }
        }

        Notifier.instance.trigger(this, TriggerOpTypes.METHOD, { method:'splice', argv: [start, deleteCount, ...items]})

        Notifier.instance.digestEffectSession()
        Notifier.instance.resetTracking()
        return result
    }
    // 显式 set 某一个 index 的值
    set(index: number, value: T) {
        this.data[index] = value
        const dep = this.indexKeyDeps.get(index)
        if (dep) {
            Notifier.instance.triggerEffects(dep, {source: this, key: index, newValue: value})
        }
        // trigger explicit key set。这是给 rxList incremental computed 计算用的
        Notifier.instance.trigger(this, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { key: index, newValue: value})
    }

    // 需要 track 的方法
    at(index: number): T|undefined{
        const dep = Notifier.instance.track(this, TrackOpTypes.GET, index)
        if (dep && !this.indexKeyDeps.has(index)) {
            this.indexKeyDeps.set(index, dep)
        }
        // CAUTION 这里不做深度的 reactive 包装
        return this.data[index]
    }

    getRaw(index: number) {
        return this.data[index]
    }
    forEach(handler: (item: T, index: number) => void) {
        for (let i = 0; i < this.data.length; i++) {
            // 转发到 at 上实现 track
            handler(this.at(i)!, i)
        }
        // track length
        Notifier.instance.track(this, TrackOpTypes.GET, 'length')
    }
    [Symbol.iterator]() {
        let index = 0;
        let data = this.data;
        // track length
        Notifier.instance.track(this, TrackOpTypes.ITERATE, 'length')
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


    // reactive methods and attr
    map<U>(mapFn: (item: T, index?: Atom<number>) => U, beforePatch?: (triggerInfo: InputTriggerInfo) => any, scheduleRecompute?: DirtyCallback ) : RxList<U>{
        const source = this
        if(mapFn.length>1) {
            this.atomIndexesDepCount++
        }

        return new RxList(
            null,
            function computation(this: RxList<U>, track) {
                track!(source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return source.data.map((_: T, index) => {
                    const getFrame = ReactiveEffect.collectEffect!()
                    // CAUTION 注意这里的 item 要用 at 拿包装过的 reactive 对象
                    const newItem = mapFn(source.at(index)!, source.atomIndexes?.[index])
                    this.effectFramesArray![index] = getFrame()
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
                            effectFrames![index] = getFrame()
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
                        const newFrame = getFrame()
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
                        this.atomIndexesDepCount--
                    }
                }
            },
        )
    }

    find() {

    }
    findIndex() {

    }

    filter() {

    }

    groupBy() {

    }

    indexBy() {

    }

    get length() {
        // TODO
        return this.data.length
    }

    // FIXME onUntrack 的时候要把 indexKeyDeps 里面的 dep 都删掉。因为 Effect 没管这种情况。
    onUntrack(effect: ReactiveEffect) {


    }
}
