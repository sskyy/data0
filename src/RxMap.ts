// import {ApplyPatchType, CallbacksType, Computed, DirtyCallback, GetterType, SkipIndicator} from "./computed.js";
// import {Observable} from "./Observable.js";
// import {Dep} from "./dep.js";
// import {Notifier} from "./notify.js";
// import {TrackOpTypes, TriggerOpTypes} from "./operations.js";
// import {ReactiveEffect} from "./reactiveEffect.js";
// import {reactive} from "./reactive.js";
//
// type EntryType = [any, any][]
// type PlainObjectType = {
//     [key: string]: any
// }
//
// export class RxMap<K, V> extends Computed implements Observable{
//     data!: Map<K, V>
//     depsMap = new Map<any, Dep>()
//     effectFramesArray?: ReactiveEffect[][]
//     constructor(source: EntryType|PlainObjectType|null, public getter?: GetterType, public applyPatch?: ApplyPatchType, scheduleRecompute?: DirtyCallback, public callbacks? : CallbacksType, public skipIndicator? : SkipIndicator, public forceAtom?: boolean) {
//         // 自己可能是 computed，也可能是最初的 reactive
//         super(getter, applyPatch, scheduleRecompute, callbacks, skipIndicator, forceAtom)
//
//         // 自己是 source
//         if (source) {
//             this.data = new Map(Array.isArray(source) ? source : Object.entries(source))
//         } else {
//             // 自己是 computed
//             this.effectFramesArray = []
//         }
//     }
//
//     // set methods
//     set(key: K, value: V) {
//         this.data.set(key, value)
//         // trigger
//         Notifier.instance.trigger(this, TriggerOpTypes.SET, { key, newValue: value})
//     }
//
//     // TODO 支持深度 Map
//     // track methods
//     get(key: any) {
//         const value = this.data.get(key)
//         Notifier.instance.track(this, TrackOpTypes.GET, key)
//         return reactive(value, this, key)
//     }
//     getRaw(key: any) {
//         return this.data.get(key)
//     }
//     // FIXME item type
//     forEach(handler: (item: any, index: K) => void) {
//         for(let [key ] of this.data) {
//             handler(this.get(key)!, key)
//         }
//         // track length
//         Notifier.instance.track(this, TrackOpTypes.GET, 'length')
//     }
//     [Symbol.iterator]() {
//         let index = 0;
//         let data = this.data;
//         // track length
//         Notifier.instance.track(this, TrackOpTypes.ITERATE, 'length')
//         const keys = Array.from(data.keys())
//         return {
//             next: () => {
//                 if (index < keys.length) {
//                     // 转发到 at 上实现 track index
//                     const value = this.get(keys[index])
//                     return { value: [value, keys[index]], done: false };
//                 } else {
//                     return { done: true };
//                 }
//             }
//         };
//     }
//
//     // reactive methods
//     entries() {
//
//     }
//     values() {
//
//     }
//     keys() {
//
//     }
//     get size() {
//         // FIXME reactive 化
//         return this.data.size
//     }
// }