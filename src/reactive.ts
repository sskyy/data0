import { isObject, toRawType, def } from './util'
import { mutableHandlers} from './baseHandlers'
import { CollectionTypes, mutableCollectionHandlers,} from './collectionHandlers'
import type {  Atom } from './atom'
import {ReactiveFlags} from "./flags";

export interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.IS_SHALLOW]?: boolean
  [ReactiveFlags.RAW]?: any
}

export const reactiveMap = new WeakMap<Target, any>()
export const shallowReactiveMap = new WeakMap<Target, any>()
export const readonlyMap = new WeakMap<Target, any>()
export const shallowReadonlyMap = new WeakMap<Target, any>()

const enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2
}

function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}

function getTargetType(value: Target) {
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
    ? TargetType.INVALID
    : targetTypeMap(toRawType(value))
}


export type ReactiveInterceptor= (a0: any, a1: any, a2: any, a3: any, a4: any) => [typeof a0, typeof a1, typeof a2, typeof a3, typeof a4]

export function reactive<T extends object>(target: T, intercept?: ReactiveInterceptor): UnwrapReactive<T>
export function reactive(target: object, intercept?: ReactiveInterceptor) {

  const args = [
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  ] as const


  const finalArgs: typeof args = intercept ? intercept(...args): args

  return createReactiveObject(...finalArgs)
}


type Primitive = string | number | boolean | bigint | symbol | undefined | null
type Builtin = Primitive | Function | Date | Error | RegExp | Number


function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>
) {
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target is already a Proxy, return it.
  if ( target[ReactiveFlags.RAW]) {
    return target
  }

  // target already has corresponding Proxy
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  // only specific value types can be observed.
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers
  )
  proxyMap.set(target, proxy)
  return proxy
}

export function isReactive(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}



export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}

export function markRaw<T extends object>(
  value: T
): T & { [RawSymbol]?: true } {
  def(value, ReactiveFlags.SKIP, true)
  return value
}

export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value



export declare const RawSymbol: unique symbol


export type UnwrapReactive<T> = T extends object
    ? {
      [P in keyof T]: P extends symbol ? T[P] : UnwrapReactiveLeaf<T[P]>
    }
    : T

export type UnwrapReactiveLeaf<T> = T extends
    | Builtin
    | CollectionTypes
    ? (Atom<T> | T)
    : T extends object
    ? UnwrapReactive<T>
    : T

