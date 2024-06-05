import {createDep, Dep, newTracked, wasTracked} from "./dep";
import {TrackOpTypes, TriggerOpTypes} from "./operations";
import {Computed, getComputedInternal} from "./computed";
import {toRaw} from "./reactive";
import {assert, extend, isArray, isIntegerKey, isIntegerKeyQuick, toNumber} from "./util";
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

export type TriggerStack = {type?: string, debugTarget: any, opType?: TriggerOpTypes, key?:unknown, oldValue?: unknown, newValue?: unknown, targetLoc: [string, string][]}[]
export type InputTriggerInfo = {
  method?: string,
  argv?: any[]
  result? : TriggerResult,
  methodResult? :any
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
}

export type TriggerInfo = {
  type: TriggerOpTypes,
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



// Map/Set 或者自定义结构 iterator 的时候用到。
// CAUTION array/object 不用，因为他们迭代的时候会触发具体 key 的 track。
export const ITERATE_KEY = Symbol( 'iterate' )
// Object/Array 执行 ownKeys 或者 Map 执行 keys 的时候用到。
export const ITERATE_KEY_KEY_ONLY = Symbol('Map key iterate' )
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
    // 为了触发 dirty computed 的 recompute
    const computedInternal = target instanceof Computed ? target: getComputedInternal(target)

    const activeEffect = ReactiveEffect.activeScopes.at(-1)
    if (computedInternal &&  computedInternal!== activeEffect) {
      computedInternal.onTrack()
    }

    if (!activeEffect || !this.shouldTrack) return
    // CAUTION 不能 track 自己。computed 在第二次执行的时候会有一个 replace 行为，会
    if (__DEV__) {
      assert(!(activeEffect instanceof Computed && target ===toRaw(activeEffect.data)), 'should not read self in computed')
    }

    // FIXME 对 async 的 reactive，要暂存，complete 的时候才确认。因为它是可以被打断重算的。

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
    if (!activeEffect.isAsync) {
      if (this.effectTrackDepth <= maxMarkerBits) {
        if (!newTracked(dep)) {
          dep.n |= Notifier.trackOpBit // set newly tracked
          shouldTrack = !wasTracked(dep)
        }
      } else {
        // Full cleanup mode.
        shouldTrack = !dep.has(activeEffect!)
      }
    } else {
      // async 模式，因为最终是用延迟的 track 来覆盖，所以总是应该 track
      shouldTrack = true
    }

    if (shouldTrack) {
      // CAUTION 即使是 async 的模式，也应该变 run 边 track 新的。
      //  这样不管是因为老的 dep 变化，还是新  track 到一半的 dep 变化，都会触发 recompute。
      //  这才是合理的，因为不管哪种都说明 dirty。
      dep.add(activeEffect!)
      activeEffect!.deps.push(dep)
      // 如果是 async 的任务，那么在最后 complete 的时候应该应该用新的 dep 完全替换旧的 dep
      if (activeEffect.isAsync) {
        activeEffect.asyncTracks.push(() => {
          if(!dep.has(activeEffect!)) {
            dep.add(activeEffect!)
            activeEffect!.deps.push(dep)
          }
        })
      }

      activeEffect!.dispatch('track', {
        effect: activeEffect!,
        ...debuggerEventExtraInfo!
      })
    }
  }
  trigger(
      source: object,
      type: TriggerOpTypes,
      inputInfo: InputTriggerInfo,
      oldTarget?: Map<unknown, unknown> | Set<unknown>
  ) {
    if (!this.shouldTrigger) return

    const info: TriggerInfo = {...inputInfo, source, type}

    const {key, newValue, oldValue} = info
    const depsMap = this.targetMap.get(source)
    if (!depsMap) {
      // never been tracked
      return
    }

    // if (__DEV__) {
    //   const getter = getComputedGetter(source)
    //   this.triggerStack.push({
    //     debugTarget: getter? getter : isAtom(source) ? source: toRaw(source),
    //     type: isAtom(source) ? 'atom' : isComputed(source) ? 'computed' : 'reactive',
    //     opType: type,
    //     key: info.key,
    //     newValue: info.newValue,
    //     oldValue: info.oldValue,
    //     targetLoc: getStackTrace()
    //   })
    // }


    let deps: (Dep | undefined)[] = []
    if (type === TriggerOpTypes.CLEAR) {
      // collection being cleared
      // trigger all effects for target
      deps = [...depsMap.values()]

    } else if (key === 'length' && isArray(source)) {
      // 数组时，可以直接 set length，相当于直接把后面的部分删掉了。
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
            deps.push(depsMap.get(ITERATE_KEY_KEY_ONLY))
          } else if (isIntegerKey(key)) {
            // new index added to array -> length changes
            deps.push(depsMap.get('length'))
          }
          break
        case TriggerOpTypes.DELETE:
          if (!isArray(source)) {
            deps.push(depsMap.get(ITERATE_KEY))
            deps.push(depsMap.get(ITERATE_KEY_KEY_ONLY))
          }
          break
        case TriggerOpTypes.SET:
          if (!isArray(source)) {
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

    // if (__DEV__) {
    //   this.triggerStack.pop()
    // }
  }
  getDepEffects(target: object) {
    const depsMap = this.targetMap.get(target)
    if (!depsMap) return

    // CAUTION 一定要利用 set 去重，不然外部拿到的结果可能引发问题。
    const result = new Set<ReactiveEffect>()
    for(const [_, deps] of depsMap) {
      for(const effect of deps) {
        result.add(effect)
      }
    }
    return result
  }
  // 重算完成以后，由 effect 调用
  //
  triggerEffects(
      dep: Dep | ReactiveEffect[],
      info: TriggerInfo,
      debuggerEventExtraInfo?: DebuggerEventExtraInfo
  ) {
    // spread into array for stabilization
    const effects = isArray(dep) ? dep : [...dep]
    for (const effect of effects) {
      // CAUTION 特别注意这里，因为我们现在支持了 lazy recompute，所以可能在读的时候才重算。
      //  重算过程中可能会再次出发 trigger，因为像 atomComputed 这种是在重算的时候更新 atom 值的。
      if (ReactiveEffect.activeScopes.at(-1) !== effect ) {
        this.triggerEffect(effect, info, debuggerEventExtraInfo)
      }
    }
  }
  triggerEffect(
      effect: ReactiveEffect,
      info: TriggerInfo,
      debuggerEventExtraInfo?: DebuggerEventExtraInfo
  ) {
    const activeEffect = ReactiveEffect.activeScopes.at(-1)
    if (activeEffect === effect) throw new Error('recursive effect call')

    effect.dispatch('trigger', extend({ effect }, debuggerEventExtraInfo))

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
