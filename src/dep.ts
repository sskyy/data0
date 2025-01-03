import { Notifier } from './notify'
import {ReactiveEffect} from "./reactiveEffect.js";

/**
 * Node structure for the linked list implementation of Dep
 */
export interface LinkedEffectNode {
    /** The reactive effect stored in this node */
    effect: ReactiveEffect
    /** Pointer to the next node in the list */
    next: LinkedEffectNode | null
}

/**
 * LinkedListDep implements Set<ReactiveEffect> interface but uses a linked list internally
 * for better performance characteristics in the reactive system
 */
class LinkedListDep extends Set<ReactiveEffect> implements TrackedMarkers {
    public head: LinkedEffectNode | null = null
    public effectToNode = new Map<ReactiveEffect, LinkedEffectNode>()
    public w: number = 0
    public n: number = 0

    constructor(effects?: ReactiveEffect[] | null) {
        super()
        if (effects) {
            for (const effect of effects) {
                this.add(effect)
            }
        }
    }

    override get size(): number {
        return this.effectToNode.size
    }

    /**
     * Get the node for a given effect, if it exists
     */
    getNode(effect: ReactiveEffect): LinkedEffectNode | undefined {
        return this.effectToNode.get(effect)
    }

    /**
     * Check if the list contains a node
     */
    hasNode(node: LinkedEffectNode): boolean {
        let current = this.head
        while (current) {
            if (current === node) return true
            current = current.next
        }
        return false
    }

    override add(effect: ReactiveEffect): this {
        if (!this.effectToNode.has(effect)) {
            const node: LinkedEffectNode = { effect, next: this.head }
            this.head = node
            this.effectToNode.set(effect, node)
            super.add(effect)
        }
        return this
    }

    override delete(effect: ReactiveEffect): boolean {
        const node = this.effectToNode.get(effect)
        if (!node) return false

        if (node === this.head) {
            this.head = node.next
        } else {
            let current = this.head
            while (current && current.next !== node) {
                current = current.next
            }
            if (current) {
                current.next = node.next
            }
        }
        
        this.effectToNode.delete(effect)
        return super.delete(effect)
    }

    override has(effect: ReactiveEffect): boolean {
        return this.effectToNode.has(effect)
    }

    override clear(): void {
        this.head = null
        this.effectToNode.clear()
        super.clear()
    }

    override forEach(callbackfn: (value: ReactiveEffect, value2: ReactiveEffect, set: Set<ReactiveEffect>) => void, thisArg?: any): void {
        const boundCallback = thisArg ? callbackfn.bind(thisArg) : callbackfn
        let current = this.head
        while (current) {
            boundCallback(current.effect, current.effect, this)
            current = current.next
        }
    }

    override entries(): IterableIterator<[ReactiveEffect, ReactiveEffect]> {
        const self = this;
        return (function* () {
            let current = self.head;
            while (current) {
                yield [current.effect, current.effect];
                current = current.next;
            }
        })();
    }

    override keys(): IterableIterator<ReactiveEffect> {
        const self = this;
        return (function* () {
            let current = self.head;
            while (current) {
                yield current.effect;
                current = current.next;
            }
        })();
    }

    override values(): IterableIterator<ReactiveEffect> {
        const self = this;
        return (function* () {
            let current = self.head;
            while (current) {
                yield current.effect;
                current = current.next;
            }
        })();
    }

    override [Symbol.iterator](): IterableIterator<ReactiveEffect> {
        return this.values();
    }
}

export type Dep = LinkedListDep

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

/**
 * Creates a new Dep instance with tracking markers initialized to 0
 * @param effects Optional array of ReactiveEffect instances to initialize the dep with
 */
export const createDep = (effects?: ReactiveEffect[]): Dep => {
  const dep = new LinkedListDep(effects)
  // Initialize tracking markers
  dep.w = 0
  dep.n = 0
  return dep
}

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
        dep.delete(effect)
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
