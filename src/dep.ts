import { Notifier } from './notify'
import {ReactiveEffect} from "./reactiveEffect.js";
import {trackRetainedDepEffectRemoved} from "./retainedDiagnostics";

export type Dep = DepCollection & TrackedMarkers

/**
 * wasTracked and newTracked maintain the status for several levels of effect
 * tracking recursion. One bit per level is used to define whether the dependency
 * was/is tracked.
 */
type TrackedMarkers = {
  /**
   * wasTracked
   */
  w: number
  /**
   * newTracked
   */
  n: number
}

type DepCollection = Iterable<ReactiveEffect> & {
  add(effect: ReactiveEffect): DepCollection
  delete(effect: ReactiveEffect): boolean
  has(effect: ReactiveEffect): boolean
}

export const createDep = (effects?: ReactiveEffect[]): Dep => {
  const dep = new Set<ReactiveEffect>(effects) as unknown as Dep
  dep.w = 0
  dep.n = 0
  return dep
}

/**
 * Most primitive atoms only have one subscriber in Axii's light binding path.
 * Keep that common case out of a native Set's backing storage, while preserving
 * the small Set-like surface used by the notifier.
 */
class CompactDep implements Dep {
  w = 0
  n = 0
  private single?: ReactiveEffect
  private overflow?: Set<ReactiveEffect>

  constructor(effects?: ReactiveEffect[]) {
    effects?.forEach(effect => this.add(effect))
  }

  add(effect: ReactiveEffect): this {
    if (this.overflow) {
      this.overflow.add(effect)
      return this
    }

    if (!this.single) {
      this.single = effect
    } else if (this.single !== effect) {
      this.overflow = new Set([this.single, effect])
      this.single = undefined
    }

    return this
  }

  delete(effect: ReactiveEffect): boolean {
    if (this.overflow) {
      const deleted = this.overflow.delete(effect)
      if (deleted && this.overflow.size === 1) {
        const [remaining] = this.overflow
        this.single = remaining
        this.overflow = undefined
      }
      return deleted
    }

    if (this.single !== effect) return false
    this.single = undefined
    return true
  }

  has(effect: ReactiveEffect): boolean {
    return this.overflow ? this.overflow.has(effect) : this.single === effect
  }

  *[Symbol.iterator](): IterableIterator<ReactiveEffect> {
    if (this.overflow) {
      yield* this.overflow
    } else if (this.single) {
      yield this.single
    }
  }
}

export const createCompactDep = (effects?: ReactiveEffect[]): Dep => new CompactDep(effects)

export const wasTracked = (dep: Dep): boolean => (dep.w & Notifier.trackOpBit) > 0

export const newTracked = (dep: Dep): boolean => (dep.n & Notifier.trackOpBit) > 0

export const initDepMarkers = ({ deps }: ReactiveEffect) => {
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].w |= Notifier.trackOpBit // set was tracked
    }
  }
}

export const finalizeDepMarkers = (effect: ReactiveEffect) => {
  const { deps } = effect
  if (deps.length) {
    let ptr = 0
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i]
      if (wasTracked(dep) && !newTracked(dep)) {
        if (dep.delete(effect)) trackRetainedDepEffectRemoved(dep)
      } else {
        deps[ptr++] = dep
      }
      // clear bits
      dep.w &= ~Notifier.trackOpBit
      dep.n &= ~Notifier.trackOpBit
    }
    deps.length = ptr
  }
}
