import { TrackOpTypes, TriggerOpTypes } from './operations'
import {extend, getStackTrace, isArray, isIntegerKey, isMap, toNumber} from './util'
import { EffectScope, recordEffectScope } from './effectScope'
import {
  createDep,
  Dep,
  finalizeDepMarkers,
  initDepMarkers,
  newTracked,
  wasTracked
} from './dep'
import {ComputedInternal, getComputedGetter, isComputed} from "./computed";
import {isAtom} from "./atom";
import {toRaw} from "./reactive";

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>()

// The number of effects currently being tracked recursively.
let effectTrackDepth = 0

export let trackOpBit = 1

/**
 * The bitwise track markers support at most 30 levels of recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 */
const maxMarkerBits = 30

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

export let activeEffect: ReactiveEffect | undefined

export const ITERATE_KEY = Symbol( 'iterate' )
export const MAP_KEY_ITERATE_KEY = Symbol('Map key iterate' )

export class ReactiveEffect<T = any> {
  active = true
  patchMode = false
  deps: Dep[] = []
  parent: ReactiveEffect | undefined = undefined

  /**
   * Can be attached after creation
   * @internal
   */
  computed?: ComputedInternal
  /**
   * @internal
   */
  allowRecurse?: boolean
  /**
   * @internal
   */
  private deferStop?: boolean

  onStop?: () => void
  // dev only
  onTrack?: (event: DebuggerEvent) => void
  // dev only
  onTrigger?: (event: DebuggerEvent) => void

  constructor(
    public fn: (trackOnce?: typeof track) => T,
    public scheduler: EffectScheduler | null = null,
    public skipIndicator?: {skip: boolean},
    scope?: EffectScope
  ) {
    recordEffectScope(this, scope)
  }
  run() {
    if (this.skipIndicator?.skip) return

    if (!this.active) {
      return this.fn()
    }

    let parent: ReactiveEffect | undefined = activeEffect
    let lastShouldTrack = shouldTrack
    while (parent) {
      if (parent === this) {
        return
      }
      parent = parent.parent
    }
    try {
      this.parent = activeEffect
      activeEffect = this
      shouldTrack = true

      trackOpBit = 1 << ++effectTrackDepth

      if (effectTrackDepth <= maxMarkerBits) {
        initDepMarkers(this)
      } else {
        cleanupEffect(this)
      }

      if (this.patchMode) {
        pauseTracking()

        const trackOnce =  (...argv: Parameters<typeof track>) => {
          // 从 pause set to default
          resetTracking()
          // 从 default set to enable
          enableTracking()
          // 因为用户的 applyPatch 里面只能拿到当前的 reactive source，那是个 proxy，而所有 trigger/track 都是基于 raw 的
          const [target, ...rest] = argv

          track(toRaw(target), ...rest)
          // 从 enable reset to default
          resetTracking()

          // 从 default set to pause
          pauseTracking()
        }
        // TODO try catch?
        const result = this.fn(trackOnce)
        resetTracking()
        return result

      } else {
        return this.fn()
      }
    } finally {
      if (effectTrackDepth <= maxMarkerBits) {
        finalizeDepMarkers(this)
      }

      trackOpBit = 1 << --effectTrackDepth

      activeEffect = this.parent
      shouldTrack = lastShouldTrack
      this.parent = undefined

      if (this.deferStop) {
        this.stop()
      }
    }
  }
  stop() {
    // stopped while running itself - defer the cleanup
    if (activeEffect === this) {
      this.deferStop = true
    } else if (this.active) {
      cleanupEffect(this)
      if (this.onStop) {
        this.onStop()
      }
      this.active = false
    }
  }
  untrack(deps: Dep[]) {
    // TODO 是不是改成 Set 比较好
    deps.forEach(dep => {
      const index = this.deps.indexOf(dep)
      if (index!== -1) this.deps.splice(index, 1)
    })
  }
}


type TrackFrame = {
  start: Function,
  deps: Dep[],
  end: Function
}
const frameStack: TrackFrame[] = []

export function cleanupEffect(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  lazy?: boolean
  scheduler?: EffectScheduler
  scope?: EffectScope
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffectRunner {
  if ((fn as ReactiveEffectRunner).effect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  const _effect = new ReactiveEffect(fn)
  if (options) {
    extend(_effect, options)
    if (options.scope) recordEffectScope(_effect, options.scope)
  }
  if (!options || !options.lazy) {
    _effect.run()
  }
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  runner.effect = _effect
  return runner
}

export function stop(runner: ReactiveEffectRunner) {
  runner.effect.stop()
}


export let shouldTrigger = true
const shouldTriggerStack: boolean[] = []

export function pauseTrigger() {
  shouldTriggerStack.push(shouldTrigger)
  shouldTrigger = false
}

export function resetTrigger() {
  const last = shouldTriggerStack.pop()
  shouldTrigger = last === undefined ? true : last
}


export let shouldTrack = true
const trackStack: boolean[] = []

export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

export function track(target: object, type: TrackOpTypes, key: unknown) {
  if (shouldTrack && activeEffect) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep()))
    }

    const eventInfo = __DEV__
      ? { effect: activeEffect, target, type, key }
      : undefined

    trackEffects(dep, eventInfo)
  }
}

export function trackEffects(
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  let shouldTrack = false
  if (effectTrackDepth <= maxMarkerBits) {
    if (!newTracked(dep)) {
      dep.n |= trackOpBit // set newly tracked
      shouldTrack = !wasTracked(dep)
    }
  } else {
    // Full cleanup mode.
    shouldTrack = !dep.has(activeEffect!)
  }

  if (shouldTrack) {
    dep.add(activeEffect!)
    activeEffect!.deps.push(dep)
    if (frameStack.length) frameStack.at(-1)!.deps.push(dep)
    if (__DEV__ && activeEffect!.onTrack) {
      activeEffect!.onTrack({
        effect: activeEffect!,
        ...debuggerEventExtraInfo!
      })
    }
  }
}


export const triggerStack: {type?: string, debugTarget: any, opType?: TriggerOpTypes, key?:unknown, oldValue?: unknown, newValue?: unknown, targetLoc: [string, string][]}[] = []
export type TriggerStack = typeof triggerStack

export function trigger(
    source: object,
    type: TriggerOpTypes,
    inputInfo: InputTriggerInfo,
    oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  if (!shouldTrigger) return

  const info: TriggerInfo = {...inputInfo, source}

  const {key, newValue, oldValue} = info
  const depsMap = targetMap.get(source)
  if (!depsMap) {
    // never been tracked
    return
  }

  if (__DEV__) {
    const getter = getComputedGetter(source)
    triggerStack.push({
      debugTarget: getter? getter : isAtom(source) ? source: toRaw(source),
      type: isAtom(source) ? 'atom' : isComputed(source) ? 'computed' : 'reactive',
      opType: type,
      key: info.key,
      newValue: info.newValue,
      oldValue: info.oldValue,
      targetLoc: getStackTrace()
    })
  }


  let deps: (Dep | undefined)[] = []
  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    deps = [...depsMap.values()]
  } else if (key === 'length' && isArray(source)) {
    const newLength = toNumber(newValue)
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= newLength) {
        deps.push(dep)
      }
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    if (key !== void 0) {
      deps.push(depsMap.get(key))
    }

    // also run for iteration key on ADD | DELETE | Map.SET
    switch (type) {
      case TriggerOpTypes.ADD:
        if (!isArray(source)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(source)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        } else if (isIntegerKey(key)) {
          // new index added to array -> length changes
          deps.push(depsMap.get('length'))
        }
        break
      case TriggerOpTypes.DELETE:
        if (!isArray(source)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(source)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        }
        break
      case TriggerOpTypes.SET:
        if (isMap(source)) {
          deps.push(depsMap.get(ITERATE_KEY))
        }
        break
      case TriggerOpTypes.METHOD:
          deps.push(depsMap.get(TriggerOpTypes.METHOD))
        break
      case TriggerOpTypes.EXPLICIT_KEY_CHANGE:
        deps.push(depsMap.get(TriggerOpTypes.EXPLICIT_KEY_CHANGE))
        break
    }
  }

  const eventInfo = __DEV__
    ? { target: source, type, key, newValue, oldValue, oldTarget }
    : undefined

  if (deps.length === 1) {
    if (deps[0]) {
      if (__DEV__) {
        triggerEffects(deps[0], info, eventInfo)
      } else {
        triggerEffects(deps[0], info)
      }
    }
  } else {
    const effects: ReactiveEffect[] = []
    for (const dep of deps) {
      if (dep) {
        effects.push(...dep)
      }
    }
    if (__DEV__) {
      triggerEffects(createDep(effects), info, eventInfo)
    } else {
      triggerEffects(createDep(effects), info)
    }
  }

  if (__DEV__) {
    triggerStack.pop()
  }
}

export function triggerEffects(
  dep: Dep | ReactiveEffect[],
  info: TriggerInfo,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  // spread into array for stabilization
  const effects = isArray(dep) ? dep : [...dep]
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect, info, debuggerEventExtraInfo)
    }
  }
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect, info, debuggerEventExtraInfo)
    }
  }
}

type KeyItemPair = {
  key?: any,
  oldValue?: any
  newValue?: any
}

export type TriggerResult = {
  add?: KeyItemPair[]
  update?: KeyItemPair[]
  remove?: KeyItemPair[]
}

export type InputTriggerInfo = {
  method?: string,
  argv?: any[]
  result? : TriggerResult,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
}

export type TriggerInfo = {
  source: any
} & InputTriggerInfo

function triggerEffect(
  effect: ReactiveEffect,
  info: TriggerInfo,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  if (effect !== activeEffect || effect.allowRecurse) {
    if (__DEV__ && effect.onTrigger) {
      effect.onTrigger(extend({ effect }, debuggerEventExtraInfo))
    }
    if (effect.scheduler) {
      effect.scheduler(info, debuggerEventExtraInfo)
    } else {
      effect.run()
    }
  }
}



