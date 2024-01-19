import {createDep, Dep, newTracked, wasTracked} from "./dep";
import {TrackOpTypes, TriggerOpTypes} from "./operations";
import {Computed, getComputedGetter, isComputed} from "./computed";
import {isAtom} from "./atom";
import {toRaw} from "./reactive";
import {assert, extend, getStackTrace, isArray, isIntegerKey, isIntegerKeyQuick, isMap, toNumber} from "./util";
import {ReactiveEffect} from "./reactiveEffect.js";


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
type KeyToDepMap = Map<any, Dep>
type TrackFrame = {
  start: Function,
  deps: Dep[],
  end: Function
}
export type TriggerStack = {type?: string, debugTarget: any, opType?: TriggerOpTypes, key?:unknown, oldValue?: unknown, newValue?: unknown, targetLoc: [string, string][]}[]
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

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}
export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo




export const ITERATE_KEY = Symbol( 'iterate' )
export const MAP_KEY_ITERATE_KEY = Symbol('Map key iterate' )
/**
 * The bitwise track markers support at most 30 levels of recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 */
export const maxMarkerBits = 30



export class Notifier {
  static trackOpBit  = 1
  static _instance: Notifier
  static get instance() {
    return Notifier._instance || (Notifier._instance = new Notifier())
  }
  // 被 track 的对象 {target -> key -> dep}
  targetMap= new WeakMap<any, KeyToDepMap>()
  arrayExplicitKeyDepCount = new WeakMap<any, number>()
  shouldTrack = true
  effectTrackDepth = 0
  frameStack: TrackFrame[] = []
  triggerStack: TriggerStack = []
  shouldTrigger: boolean = true
  trackStack: boolean[] = []
  effectsInSession: Set<ReactiveEffect> = new Set()
  effectsInSessionPayloads = new WeakMap<ReactiveEffect, TriggerInfo[]>
  inEffectSession: boolean = false
  isDigesting: boolean = false
  sessionDepth = 0
  createEffectSession() {
    if (this.isDigesting) return
    this.inEffectSession = true
    this.sessionDepth++
  }
  scheduleEffect(effect: ReactiveEffect, info: TriggerInfo, debuggerEventExtraInfo?: DebuggerEventExtraInfo) {
    if (__DEV__) {
      assert(this.inEffectSession, 'should be in effect session')
    }
    this.effectsInSession.add(effect)
    let effectInfos = this.effectsInSessionPayloads.get(effect)
    if (!effectInfos) {
      this.effectsInSessionPayloads.set(effect, effectInfos = [])
    }
    effectInfos.push(info)
  }
  digestEffectSession() {
    if (this.isDigesting) return
    this.sessionDepth--
    if (this.sessionDepth > 0) return

    this.isDigesting = true
    const effectItor = this.effectsInSession[Symbol.iterator]()
    let effect: ReactiveEffect | undefined
    while(effect = effectItor.next().value) {
        const infos = this.effectsInSessionPayloads.get(effect)
        effect.run(infos)
        this.effectsInSession.delete(effect)
        this.effectsInSessionPayloads.delete(effect)
    }
    if(__DEV__) {
      assert(this.effectsInSession.size === 0, 'effectsInSession should be empty')
    }
    this.inEffectSession = false
    this.isDigesting = false
  }
  track = (target: object, type: TrackOpTypes, key: unknown) => {
    const activeEffect = ReactiveEffect.activeScopes.at(-1)
    if (!activeEffect || !this.shouldTrack) return
    // CAUTION 不能 track 自己。computed 在第二次执行的时候会有一个 replace 行为，会
    if (__DEV__) {
      assert(!(activeEffect instanceof Computed && target ===toRaw(activeEffect.data)), 'should not read self in computed')
    }

    let depsMap = this.targetMap.get(target)
    if (!depsMap) {
      this.targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep()))
    }

    const eventInfo = __DEV__
        ? { effect: activeEffect, target, type, key }
        : undefined


    // CAUTION 这是为了优化 unshift 性能而记录的。因为 array 是有序索引
    //  我们没有在重新计算的时候去 -count，因为目前的数据结构很难再重新 run 的时候拿到 target，我们目前只拿到了 target->key->dep
    //  但是实际情况中，可能很少会有“有时显式监听key，有时又不得情况”，所以暂时这样也可行。
    if (isArray(target) && isIntegerKeyQuick(key)) {
        let count = this.arrayExplicitKeyDepCount.get(target) || 0
        this.arrayExplicitKeyDepCount.set(target, ++count)
    }

    this.trackEffects(dep, eventInfo)
    return dep
  }
  trackEffects(
      dep: Dep,
      debuggerEventExtraInfo?: DebuggerEventExtraInfo
  ) {
    const  activeEffect = ReactiveEffect.activeScopes.at(-1)
    if (!activeEffect) return
    let shouldTrack = false
    if (this.effectTrackDepth <= maxMarkerBits) {
      if (!newTracked(dep)) {
        dep.n |= Notifier.trackOpBit // set newly tracked
        shouldTrack = !wasTracked(dep)
      }
    } else {
      // Full cleanup mode.
      shouldTrack = !dep.has(activeEffect!)
    }

    if (shouldTrack) {
      dep.add(activeEffect!)
      activeEffect!.deps.push(dep)
      if (this.frameStack.length) this.frameStack.at(-1)!.deps.push(dep)
      if (__DEV__ && activeEffect!.onTrack) {
        activeEffect!.onTrack({
          effect: activeEffect!,
          ...debuggerEventExtraInfo!
        })
      }
    }
  }
  trigger(
      source: object,
      type: TriggerOpTypes,
      inputInfo: InputTriggerInfo,
      oldTarget?: Map<unknown, unknown> | Set<unknown>
  ) {
    if (!this.shouldTrigger) return

    const info: TriggerInfo = {...inputInfo, source}

    const {key, newValue, oldValue} = info
    const depsMap = this.targetMap.get(source)
    if (!depsMap) {
      // never been tracked
      return
    }

    if (__DEV__) {
      const getter = getComputedGetter(source)
      this.triggerStack.push({
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
          this.triggerEffects(deps[0], info, eventInfo)
        } else {
          this.triggerEffects(deps[0], info)
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
        this.triggerEffects(createDep(effects), info, eventInfo)
      } else {
        this.triggerEffects(createDep(effects), info)
      }
    }

    if (__DEV__) {
      this.triggerStack.pop()
    }
  }
  triggerEffects(
      dep: Dep | ReactiveEffect[],
      info: TriggerInfo,
      debuggerEventExtraInfo?: DebuggerEventExtraInfo
  ) {
    // spread into array for stabilization
    const effects = isArray(dep) ? dep : [...dep]
    for (const effect of effects) {
      this.triggerEffect(effect, info, debuggerEventExtraInfo)
    }
  }
  triggerEffect(
      effect: ReactiveEffect,
      info: TriggerInfo,
      debuggerEventExtraInfo?: DebuggerEventExtraInfo
  ) {
    // const activeEffect = ReactiveEffect.activeScopes.at(-1)
    // if (activeEffect === effect) throw new Error('recursive effect call')
    if (__DEV__ && effect.onTrigger) {
      effect.onTrigger(extend({ effect }, debuggerEventExtraInfo))
    }

    if (this.inEffectSession) {
      this.scheduleEffect(effect, info, debuggerEventExtraInfo)
    } else {
      effect.run([info], debuggerEventExtraInfo)
    }
  }
  enableTracking() {
    this.trackStack.push(this.shouldTrack)
    this.shouldTrack = true
  }
  pauseTracking() {
    this.trackStack.push(this.shouldTrack)
    this.shouldTrack = false
  }
  resetTracking() {
    const last = this.trackStack.pop()
    this.shouldTrack = last === undefined ? true : last
  }
}
