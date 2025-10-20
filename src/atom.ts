import {Notifier} from "./notify";
import {TrackOpTypes, TriggerOpTypes} from './operations'
import {def, isPlainObject, isStringOrNumber} from "./util";
import {ReactiveFlags} from "./flags";
import {setDebugName} from "./debug";

export type UpdateFn<T> = (prev: T) => T

export interface AtomBase<T> {
  [ReactiveFlags.IS_ATOM]: true,
  raw: T,
  (newValue?: any): T
}

export type Atom<T = any> = T extends object ? (AtomBase<T> & T) : AtomBase<T>

export type AtomInitialType = any


export type AtomInterceptor<T>  = (updater: Updater<T>, h: Handler) => [Updater<T>, Handler]

type Updater<T> = (newValue?: T | UpdateFn<T>) => any
type Handler = ProxyHandler<object>

/**
 * @category Basic
 */
export function atom<T>(initValue: T, interceptor? : AtomInterceptor<typeof initValue>, name?: string): Atom<T>
export function atom<T>(initValue: null, interceptor? : AtomInterceptor<typeof initValue>, name?: string): Atom<T|null>
export function atom<T>(initValue?: T | undefined, interceptor? : AtomInterceptor<typeof initValue>, name?: string): Atom<T|undefined>
export function atom(initValue: AtomInitialType, interceptor? : AtomInterceptor<typeof initValue>, name?: string)  {

    let value: typeof initValue|undefined  = initValue

    // CAUTION 只能这样写才能支持 arguments.length === 0 ，否则就永远不会 为 0
    function updater (newValue?: typeof initValue) {
        if (arguments.length === 0) {
            Notifier.instance.track(finalProxy, TrackOpTypes.ATOM, 'value')
            return value
        }

        // CAUTION 不再支持 newValue 为 function 的方式，因为 atom 中可以包装 atom，就像指针可以指向另一个指针一样。
        // if(typeof newValue === 'function') {
        //     value = newValue!(value)
        // } else {
        //     value = newValue
        // }
        if (value === newValue) return
        const oldValue = value
        value = newValue
        Notifier.instance.trigger(finalProxy, TriggerOpTypes.ATOM, { key: 'value', newValue, oldValue})
    }

    const handler:Handler = {
        get(target, key) {
            // 对外提供一种获取 value，但是不触发 track 的方式。在一些框架里面会用到
            if (key === 'raw'||key ===ReactiveFlags.RAW) return value

            if (key === ReactiveFlags.IS_ATOM) return true
            if (key === 'call') return function(_this:any, newValue?: typeof initValue) {
                return arguments.length > 1 ? finalUpdater.call(_this, newValue): finalUpdater.call(_this)
            }

            // TODO 是不是也要像 reactive 一样层层包装才行？？？，不然当把这个值传给 dom 元素的时候，它就已经不能被识别出来，也就不能 reactive 了。
            if (isPlainObject(value)) {
                Notifier.instance.track(finalProxy, TrackOpTypes.ATOM, 'value')
            }
            // CAUTION 针对非  class 的对象提供深度的获取的能力
            return Reflect.get(isPlainObject(value) ? value : finalUpdater, key)
        },
        set(target, key, newValue) {
            // CAUTION 注意这里是不 trigger 的
            if (typeof value === 'object') {
                return Reflect.set(value, key, newValue)
            }

            return false
        },
        // TODO 有必要要吗？？？
        getPrototypeOf(): object | null {
            if (value && typeof value === 'object') return Reflect.getPrototypeOf(value as object)
            return null
        }
    }



    const [finalUpdater, finalHandler] = interceptor ? interceptor(updater, handler) : [updater, handler]


    Object.assign( finalUpdater, {
        [Symbol.toPrimitive](hint: string) {
            Notifier.instance.track(finalProxy, TrackOpTypes.ATOM, 'value')
            if ((!hint || hint === 'default') && isStringOrNumber(value)) {
                return value
            } else if (hint === 'number' && typeof value === 'number' ) {
                // CAUTION 不支持 string 隐式转 number
                return value;
            } else if (hint === 'string'){
                return isStringOrNumber(value) ? value.toString() : Object.prototype.toString.call(value)
            }

            return null;
        }
    })

    if (name) {
        setDebugName(finalUpdater, name)
    }

    def(finalUpdater, ReactiveFlags.IS_ATOM, true)
    const finalProxy = new Proxy(finalUpdater, finalHandler) as Atom<typeof initValue>
    return finalProxy
}

atom.fixed = function<T>(initValue: T) {
    function getValue() {
        return initValue
    }
    def(getValue, ReactiveFlags.IS_ATOM, true)
    return getValue as Atom<T>
}

atom.lazy = function<T>(getter: () => T) {
    def(getter, ReactiveFlags.IS_ATOM, true)
    return getter as Atom<T>
}


atom.as = new Proxy({}, {
    get(p, name: string) {
        return (initialValue: Parameters<typeof atom>[0], interceptor: Parameters<typeof atom>[1]) => {
            return atom(initialValue, interceptor, name)
        }
    }
})

/**
 * @category Basic
 */
export function isAtom<T>(r: Atom<T> | unknown): r is Atom<T>
export function isAtom(r: any): r is Atom<any> {
    return !!(r && r[ReactiveFlags.IS_ATOM])
}
