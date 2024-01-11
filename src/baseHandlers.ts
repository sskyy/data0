import {
  reactive,
  reactiveMap,
  shallowReactiveMap,
  Target,
  toRaw,

} from './reactive'
import {ReactiveFlags} from './flags'

import {TrackOpTypes, TriggerOpTypes,} from './operations'
import {ITERATE_KEY, pauseTracking, resetTracking, track, trigger,} from './effect'
import {
  def,
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isPlainObject,
  isSymbol,
  makeMap
} from './util'
import {Atom, isAtom, UpdateFn} from "./atom";

export const isNonTrackableKeys = /*#__PURE__*/ makeMap(`constructor,__proto__,__v_isAtom,${ReactiveFlags.IS_REACTIVE}}`)

export const builtInSymbols = new Set(
  /*#__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()

const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

export const inCollectionMethodTargets = new WeakSet()

function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {}
  // instrument identity-sensitive Array methods to account for possible reactive
  // values
  ;(['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, TrackOpTypes.GET, i + '')
      }
      // we run the method using the original args first (which may be reactive)
      const res = arr[key](...args)
      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        return arr[key](...args.map(toRaw))
      } else {
        return res
      }
    }
  })

  // instrument length-altering mutation methods to avoid length being tracked
  // which leads to infinite loops in some cases (#2137)
  ;(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const rawTarget = toRaw(this)
      pauseTracking()

      inCollectionMethodTargets.add(rawTarget)

      //  CAUTION 因为 splice 原本的参数非常有歧义所以警告一下
      if (__DEV__) {
        if (key === 'splice') {
          if (args.length > 1 && (typeof args[1] !== 'number' || args[1] < 0)) {
            console.warn(`don't use ${args[1]} as second parameter of splice, it is prone to bug.`)
          }
        }
      }

      // TODO 针对 长列表 unshift 的场景，需要判断一下有没有 computed 显式监听了 key.
      //  不然这里一路触发所有的 key 会很慢。
      const res = (rawTarget as any)[key].apply(this, args)
      inCollectionMethodTargets.delete(rawTarget)

      trigger(rawTarget, TriggerOpTypes.METHOD, { method:key, argv: args})
      resetTracking()
      return res
    }
  })
  return instrumentations
}

function createGetter(isReadonly = false, shallow = false) {
  return function get(target: Target, rawKey: string | symbol, receiver: object) {
    if (rawKey === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (rawKey === ReactiveFlags.IS_ATOM) {
      return false
    }else if (rawKey === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (rawKey === ReactiveFlags.IS_SHALLOW) {
      return shallow
    } else if (
      rawKey === ReactiveFlags.RAW &&
      receiver ===
        (shallow
          ? shallowReactiveMap
          : reactiveMap
        ).get(target)
    ) {
      return target
    }

    const targetIsArray = isArray(target)

    if (!isReadonly && targetIsArray && hasOwn(arrayInstrumentations, rawKey)) {
      return Reflect.get(arrayInstrumentations, rawKey, receiver)
    }

    const isReactiveKey = typeof rawKey === 'string' && rawKey[0] === '$'
    const key = isReactiveKey ? (rawKey as string).slice(1, Infinity) : rawKey
    const res = Reflect.get(target, key, receiver)

    if (!(isNonTrackableStringOrSymbolKey(key)) && !(targetIsArray && hasOwn(arrayInstrumentations, rawKey))) {
      track(target, TrackOpTypes.GET, key)
    }

    if (isReactiveKey) {
      return createLeafAtom(target, key)
    }

    if (isNonTrackableStringOrSymbolKey(key) ||
        isAtom(res) ||
        targetIsArray && (!isIntegerKey(key))
    ) {
      return res
    }

    if (isPlainObject(res)) {
      return reactive(res)
    }

    return res
  }
}

export function isNonTrackableStringOrSymbolKey(key:string |symbol) {
  return isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)
}


function createLeafAtom(target: Target, key: string|symbol) {
  function getterOrSetter(newValue?: any | UpdateFn<any>){
    if (arguments.length === 0) {
      track(target, TrackOpTypes.GET, key)
      return Reflect.get(target, key)
    }

    const oldValue = Reflect.get(target, key)
    Reflect.set(target, key, newValue)

    trigger(target, TriggerOpTypes.SET,  {key, newValue, oldValue })
    if (!inCollectionMethodTargets.has(toRaw(target))) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE,  {result: {update: [{key, oldValue, newValue}]} })
    }

    return
  }

  getterOrSetter.toString = () =>{
    track(target, TrackOpTypes.GET, key)
    return Reflect.get(target, key)?.toString()
  }

  getterOrSetter.valueOf = () =>{
    track(target, TrackOpTypes.GET, key)
    return Reflect.get(target, key)?.valueOf()
  }

  def(getterOrSetter, ReactiveFlags.IS_REACTIVE, true)
  def(getterOrSetter, ReactiveFlags.IS_ATOM, true)

  return getterOrSetter as Atom
}

const set = /*#__PURE__*/ createSetter()

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    let oldValue = (target as any)[key]
    if (isAtom(oldValue) && !isAtom(value)) {
      return false
    }

    if( isAtom(value)) console.warn(`you are assign an atom to ${key.toString()}`)

    value = toRaw(value)

    const hadKey =
        isArray(target) && isIntegerKey(key)
            ? Number(key) < target.length
            : hasOwn(target, key)

    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original

    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, { key, newValue: value })
        if (!inCollectionMethodTargets.has(toRaw(target))) {
          trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: {add: [{ key, newValue: value, }]} })
        }


      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, { key, newValue: value, oldValue})
        if (!inCollectionMethodTargets.has(toRaw(target))) {
          trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: {update: [{ key, oldValue, newValue: value }]} })
        }

      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, {key, newValue: undefined, oldValue })

    if (!inCollectionMethodTargets.has(toRaw(target))) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: { remove: [{ key: key, oldValue }]} })
    }

  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

function ownKeys(target: object): (string | symbol)[] {
  track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}


