import {Dep, finalizeDepMarkers, initDepMarkers} from "./dep.js";
import {DebuggerEvent, maxMarkerBits, Notifier} from "./notify.js";
import { assert} from "./util.js";

export type EffectCollectFrame = ReactiveEffect[]
export class ReactiveEffect {
    static activeScopes: ReactiveEffect[] = []

    static destroy(effect: ReactiveEffect, fromParent?: boolean) {
        if (!effect.active) return

        effect.cleanup()
        effect.active = false

        // 如果不是 fromParent，就要从父亲中移除。如果是，父亲会自己清空 children
        if (effect.parent && !fromParent) {
            // 要把自己从 parent.children 中移除掉。直接用 last 替换掉当前的要上出的，提升删除速度。
            const last = effect.parent.children.pop()!
            if (last !== effect) {
                effect.parent.children[effect.index!] = last
                last.index = effect.index
            }
        }

        delete effect.parent
        effect.children.forEach(child => {
            ReactiveEffect.destroy(child, true)
        })
        effect.children = []
        effect.onDestroy?.()
    }

    static effectCollectFrames: EffectCollectFrame[] = []
    static collectEffect() {
        const frame: EffectCollectFrame = []
        ReactiveEffect.effectCollectFrames.push(frame)
        return () => {
            assert(ReactiveEffect.effectCollectFrames.at(-1) === frame, 'collect effect frame error')
            return ReactiveEffect.effectCollectFrames.pop()!
        }
    }

    deps: Dep[] = []
    active = true
    parent?: ReactiveEffect
    children: ReactiveEffect[] = []
    index = 0

    constructor() {
        if (ReactiveEffect.activeScopes.length) {
            this.parent = ReactiveEffect.activeScopes.at(-1)
            this.parent!.children.push(this)
            this.index = this.parent!.children.length - 1
        }

        const collectFrame = ReactiveEffect.effectCollectFrames.at(-1)
        if (collectFrame) {
            collectFrame.push(this)
        }
    }

    onDestroy?: () => void
    // dev only
    onTrack?: (event: DebuggerEvent) => void
    // dev only
    onTrigger?: (event: DebuggerEvent) => void

    effectFn() {
    }

    run(...args: any[]): any {
        // 一般用于调试
        if (!this.active) {
            return this.effectFn()
        }
        if (ReactiveEffect.activeScopes.includes(this)) {
            throw new Error('recursive effect call')
        }

        try {

            Notifier.trackOpBit = 1 << ++Notifier.instance.effectTrackDepth
            ReactiveEffect.activeScopes.push(this)
            // 因为这里的 run 可能是某个 computed 里面的 replace 里的 splice 之类的引起的。
            //  而在 splice 等 array instrumentations 里面，为了防止这些方法的读操作也被 track 了，所以是 stopTracking 了的。
            //  再传到这里就也会导致不 tracking 了。所以这里要重新 enableTracking 一下。
            Notifier.instance.enableTracking()

            if (Notifier.instance.effectTrackDepth <= maxMarkerBits) {
                initDepMarkers(this)
            } else {
                this.cleanup()
            }

            this.children.forEach(child => ReactiveEffect.destroy(child, true))
            this.children = []


            return this.effectFn()
        } finally {
            if (Notifier.instance.effectTrackDepth <= maxMarkerBits) {
                finalizeDepMarkers(this)
            }

            Notifier.instance.resetTracking()
            ReactiveEffect.activeScopes.pop()

            Notifier.trackOpBit = 1 << --Notifier.instance.effectTrackDepth

        }
    }

    cleanup() {
        const {deps} = this
        if (deps.length) {
            for (let i = 0; i < deps.length; i++) {
                deps[i].delete(this)
            }
            deps.length = 0
        }
    }
}