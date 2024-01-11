import {toRaw, toReactive} from './reactive'
import { track, trigger, ITERATE_KEY, MAP_KEY_ITERATE_KEY } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import {hasOwn, hasChanged, toRawType, isMap, def, assert} from './util'
import {inCollectionMethodTargets} from "./baseHandlers";
import {ReactiveFlags} from "./flags";
import {Atom, UpdateFn} from "./atom";

export type CollectionTypes = IterableCollections | WeakCollections

type IterableCollections = Map<any, any> | Set<any>
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type MapTypes = Map<any, any> | WeakMap<any, any>
type SetTypes = Set<any> | WeakSet<any>


const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)


function get(
  target: MapTypes,
  key: unknown,
  isReadonly = false,
) {
  target = (target as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)
  const rawKey = toRaw(key)
  if (!isReadonly) {
    if (key !== rawKey) {
      track(rawTarget, TrackOpTypes.GET, key)
    }
    track(rawTarget, TrackOpTypes.GET, rawKey)
  }
  const { has } = getProto(rawTarget)
  if (has.call(rawTarget, key)) {
    return toReactive(target.get(key))
  } else if (has.call(rawTarget, rawKey)) {
    return toReactive(target.get(rawKey))
  } else if (target !== rawTarget) {
    target.get(key)
  }
}


function $get(
    target: MapTypes,
    key: unknown,
    isReadonly = false,
) {
  target = (target as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)
  const rawKey = toRaw(key)
  if (!isReadonly) {
    // TODO 什么情况下？
    if (key !== rawKey) {
      track(rawTarget, TrackOpTypes.GET, key)
    }
    track(rawTarget, TrackOpTypes.GET, rawKey)
  }
  const { has } = getProto(rawTarget)
  if (has.call(rawTarget, key)) {
    return createLeafAtom(target, key)
  } else if (has.call(rawTarget, rawKey)) {
    return createLeafAtom(target, rawKey)
  } else {
    assert(false, `can not find key ${(key as string).toString()}`)
  }
}


function createLeafAtom(target: MapTypes, key: any) {
  function getterOrSetter(newValue?: any | UpdateFn<any>){
    if (arguments.length === 0) {
      track(target, TrackOpTypes.GET, key)
      return target.get(key)
    }

    const oldValue = target.get(key)
    target.set(key, newValue)

    trigger(target, TriggerOpTypes.SET,  {key, newValue, oldValue })
    if (!inCollectionMethodTargets.has(toRaw(target))) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE,  {result: {update: [{key, oldValue, newValue}]} })
    }

    return
  }

  getterOrSetter.toString = () =>{
    track(target, TrackOpTypes.GET, key)
    return target.get(key)?.toString()
  }

  getterOrSetter.valueOf = () =>{
    track(target, TrackOpTypes.GET, key)
    return target.get(key)?.valueOf()
  }

  def(getterOrSetter, ReactiveFlags.IS_REACTIVE, true)
  def(getterOrSetter, ReactiveFlags.IS_ATOM, true)

  return getterOrSetter as Atom
}


function has(this: CollectionTypes, key: unknown, isReadonly = false): boolean {
  const target = (this as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)
  const rawKey = toRaw(key)
  if (!isReadonly) {
    if (key !== rawKey) {
      track(rawTarget, TrackOpTypes.HAS, key)
    }
    track(rawTarget, TrackOpTypes.HAS, rawKey)
  }
  return key === rawKey
    ? target.has(key)
    : target.has(key) || target.has(rawKey)
}


function size(target: IterableCollections, isReadonly = false) {
  target = (target as any)[ReactiveFlags.RAW]
  !isReadonly && track(toRaw(target), TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.get(target, 'size', target)
}


function add(this: SetTypes, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const proto = getProto(target)
  const hadKey = proto.has.call(target, value)
  if (!hadKey) {
    target.add(value)
    trigger(target, TriggerOpTypes.ADD, { newValue: value })
    if (!inCollectionMethodTargets.has(toRaw(target))) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: {add: [{newValue: value}]} })
    }

  }
  return this
}


function set(this: MapTypes, key: unknown, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const { has, get } = getProto(target)

  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }

  const oldValue = get.call(target, key)
  target.set(key, value)
  if (!hadKey) {
    trigger(target, TriggerOpTypes.ADD, {key, newValue: value })
    if (!inCollectionMethodTargets.has(target)) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: { add: [{key,  oldValue}]} })
    }

  } else if (hasChanged(value, oldValue)) {
    trigger(target, TriggerOpTypes.SET, { key, newValue: value, oldValue })
    if (!inCollectionMethodTargets.has(target)) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: { update: [{key, oldValue, newValue: value}]} })
    }

  }
  return this
}


function deleteEntry(this: CollectionTypes, key: unknown) {
  const target = toRaw(this)
  const { has, get } = getProto(target)
  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }

  const oldValue = get ? get.call(target, key) : undefined
  // forward the operation before queueing reactions
  const result = target.delete(key)
  if (hadKey) {
    trigger(target, TriggerOpTypes.DELETE, { key, newValue: undefined, oldValue})
    if (!inCollectionMethodTargets.has(toRaw(target))) {
      trigger(target, TriggerOpTypes.EXPLICIT_KEY_CHANGE, { result: {remove: [{ key, oldValue}]} })
    }

  }
  return result
}


function clear(this: IterableCollections) {
  const target = toRaw(this)
  const hadItems = target.size !== 0
  const oldTarget = __DEV__
    ? isMap(target)
      ? new Map(target)
      : new Set(target)
    : undefined
  // forward the operation before queueing reactions
  inCollectionMethodTargets.add(target)
  const result = target.clear()
  inCollectionMethodTargets.delete(target)
  if (hadItems) {
    trigger(target, TriggerOpTypes.CLEAR, {}, oldTarget)
    trigger(target, TriggerOpTypes.METHOD, { method: 'clear'}, oldTarget)
  }
  return result
}


function createForEach(isReadonly: boolean, isShallow: boolean) {
  return function forEach(
    this: IterableCollections,
    callback: Function,
    thisArg?: unknown
  ) {
    const observed = this as any
    const target = observed[ReactiveFlags.RAW]
    const rawTarget = toRaw(target)
    !isReadonly && track(rawTarget, TrackOpTypes.ITERATE, ITERATE_KEY)
    return target.forEach((value: unknown, key: unknown) => {
      // important: make sure the callback is
      // 1. invoked with the reactive map as `this` and 3rd arg
      // 2. the value received should be a corresponding reactive/readonly.
      return callback.call(thisArg, toReactive(value), toReactive(key), observed)
    })
  }
}

interface Iterable {
  [Symbol.iterator](): Iterator
}

interface Iterator {
  next(value?: any): IterationResult
}

interface IterationResult {
  value: any
  done: boolean
}


function createIterableMethod(
  method: string | symbol,
  isReadonly: boolean,
  isShallow: boolean
) {
  return function (
    this: IterableCollections,
    ...args: unknown[]
  ): Iterable & Iterator {
    const target = (this as any)[ReactiveFlags.RAW]
    const rawTarget = toRaw(target)
    const targetIsMap = isMap(rawTarget)
    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)
    const isKeyOnly = method === 'keys' && targetIsMap
    const innerIterator = target[method](...args)
    !isReadonly &&
      track(
        rawTarget,
        TrackOpTypes.ITERATE,
        isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
      )
    // return a wrapped iterator which returns observed versions of the
    // values emitted from the real iterator
    return {
      // iterator protocol
      next() {
        const { value, done } = innerIterator.next()
        return done
          ? { value, done }
          : {
              value: isPair ? [toReactive(value[0]), toReactive(value[1])] : toReactive(value),
              done
            }
      },
      // iterable protocol
      [Symbol.iterator]() {
        return this
      }
    }
  }
}


function createInstrumentations() {
  const mutableInstrumentations: Record<string, Function | number> = {
    get(this: MapTypes, key: unknown) {
      return get(this, key)
    },
    // 得到一个 leaf atom
    $get(this: MapTypes, key: unknown) {
      return $get(this, key)
    },
    get size() {
      return size(this as unknown as IterableCollections)
    },
    has,
    add,
    set,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, false)
  }


  const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
  iteratorMethods.forEach(method => {
    mutableInstrumentations[method as string] = createIterableMethod(
      method,
      false,
      false
    )
  })

  return [
    mutableInstrumentations,
  ]
}

const [
  mutableInstrumentations,
] = /* #__PURE__*/ createInstrumentations()

const DELEGATE_MAP_GET = '$get'

function createInstrumentationGetter(isReadonly: boolean) {
  return (
    target: CollectionTypes,
    key: string | symbol,
    receiver: CollectionTypes
  ) => {
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.RAW) {
      return target
    }

    // CAUTION 为 Map 增加了 $get 方法
    return Reflect.get(
      hasOwn(mutableInstrumentations, key) && (key in target || key === DELEGATE_MAP_GET && target instanceof Map)
        ? mutableInstrumentations
        : target,
      key,
      receiver
    )
  }
}


export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*#__PURE__*/ createInstrumentationGetter(false)
}


function checkIdentityKeys(
  target: CollectionTypes,
  has: (key: unknown) => boolean,
  key: unknown
) {
  const rawKey = toRaw(key)
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target)
    console.warn(
      `Reactive ${type} contains both the raw and reactive ` +
        `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
        `which can lead to inconsistencies. ` +
        `Avoid differentiating between the raw and reactive versions ` +
        `of an object and only use the reactive version if possible.`
    )
  }
}
