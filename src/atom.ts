import {
    activeEffect,
    shouldTrack,
    trackEffects,
    triggerEffects, triggerStack
} from './effect'

import { TrackOpTypes } from './operations'
import {createDep, Dep} from "./dep";
import {def, getStackTrace, isPlainObject, isStringOrNumber} from "./util";
import {ReactiveFlags} from "./flags";
import { setDebugName} from "./debug";

export type UpdateFn<T> = (prev: T) => T

export type Atom<T = any> = T & ((newValue?: any| UpdateFn<T>) => any) & { __v_isAtom: boolean }

export type AtomInitialType = any

const refToDepMap = new WeakMap<Atom<any>, Dep>()

export function trackAtomValue(ref: Atom<any>) {
    if (shouldTrack && activeEffect) {
        let dep = refToDepMap.get(ref)
        if (!dep) refToDepMap.set(ref, dep = createDep())
        if (__DEV__) {
            trackEffects(dep, {
                target: ref,
                type: TrackOpTypes.GET,
                key: 'value'
            })
        } else {
            trackEffects(dep)
        }
    }
}

export function triggerAtomValue(ref: Atom<any>, newValue?: any) {
    const dep = refToDepMap.get(ref)
    if (dep) {
        if (__DEV__) {
            triggerStack.push({debugTarget: ref, newValue, targetLoc: getStackTrace()})
        }
        triggerEffects(dep, {
            key: 'value',
            newValue: newValue
        })
    }
}



export type AtomInterceptor<T>  = (updater: Updater<T>, h: Handler) => [Updater<T>, Handler]

type Updater<T> = (newValue?: T | UpdateFn<T>) => any
type Handler = ProxyHandler<object>


export function atom(initValue: AtomInitialType, interceptor? : AtomInterceptor<typeof initValue>, name?: string)  {
    if (isAtom(initValue)) throw new Error('cant wrap atom inside atom')

    let value: typeof initValue|undefined  = initValue

    // CAUTION 只能这样写才能支持 arguments.length === 0 ，否则就永远不会 为 0
    function updater (newValue?: typeof initValue | UpdateFn<typeof initValue>) {
        if (arguments.length === 0) {
            trackAtomValue(finalUpdater)
            return value
        }

        if(typeof newValue === 'function') {
            value = newValue!(value)
        } else {
            value = newValue
        }

        triggerAtomValue(finalUpdater, value)
    }

    const handler:Handler = {
        get(target, key) {
            // TODO 是不是也要像 reactive 一样层层包装才行？？？，不然当把这个值传给 dom 元素的时候，它就已经不能被识别出来，也就不能 reactive 了。
            if (isPlainObject(value)) {
                trackAtomValue(finalUpdater)
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
            trackAtomValue(finalUpdater)
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
    return new Proxy(finalUpdater, finalHandler) as Atom<typeof initValue>
}

atom.as = new Proxy({}, {
    get(p, name: string) {
        return (initialValue: Parameters<typeof atom>[0], interceptor: Parameters<typeof atom>[1]) => {
            return atom(initialValue, interceptor, name)
        }
    }
})


export function isAtom<T>(r: Atom<T> | unknown): r is Atom<T>
export function isAtom(r: any): r is Atom<any> {
    return !!(r && r.__v_isAtom)
}


