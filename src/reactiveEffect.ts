import {Dep, finalizeDepMarkers, initDepMarkers} from "./dep.js";
import {maxMarkerBits, Notifier} from "./notify.js";
import {ManualCleanup} from "./manualCleanup.js";
import {GetterContext, GetterType} from "./computed.js";
import {isGenerator} from "./util.js";


export class ReactiveEffect extends ManualCleanup {
    static activeScopes: ReactiveEffect[] = []
    public active = true
    public isRunningAsync = false
    public eventToCallbacks: Map<string, Set<Function>> = new Map()
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
        effect.dispatch('destroy')
    }

    deps: Dep[] = []
    parent?: ReactiveEffect
    children: ReactiveEffect[] = []
    index = 0
    isAsync?:boolean
    constructor(public getter?: GetterType) {
        // 这是为了支持有的数据结构想写成 source/computed 都支持的情况，比如 RxList。它会继承 Computed
        super();
        this.isAsync = this.getter && isGenerator(this.getter)

        if (ReactiveEffect.activeScopes.length) {
            this.parent = ReactiveEffect.activeScopes.at(-1)
            this.parent!.children.push(this)
            this.index = this.parent!.children.length - 1
        }
    }

    on(event: string, callback: Function) {
        let callbacks = this.eventToCallbacks.get(event)
        if (!callbacks) {
            callbacks = new Set()
            this.eventToCallbacks.set(event, callbacks)
        }
        callbacks.add(callback)
    }
    off(event: string, callback: Function) {
        let callbacks = this.eventToCallbacks.get(event)
        if (callbacks) {
            callbacks.delete(callback)
        }
    }
    dispatch = (event: string, ...args: any[]) => {
        const callbacks = this.eventToCallbacks.get(event)
        if (callbacks) {
            callbacks.forEach(callback => callback.call(this, ...args))
        }
    }

    callGetter():any {

    }
    prepareTracking(isFirst = false) {
        if (!this.isAsync) {
            Notifier.trackOpBit = 1 << ++Notifier.instance.effectTrackDepth
            ReactiveEffect.activeScopes.push(this)

            if (Notifier.instance.effectTrackDepth <= maxMarkerBits) {
                initDepMarkers(this)
            } else {
                this.cleanup()
            }

            this.children.forEach(child => ReactiveEffect.destroy(child, true))
            this.children = []

        } else {
            // 如果是 async 的，只需要push scope 就行了。
            ReactiveEffect.activeScopes.push(this)
            if (isFirst) {
                this.cleanup()
                this.children.forEach(child => ReactiveEffect.destroy(child, true))
                this.children = []
            }
        }
    }
    createGetterContext():GetterContext|undefined {
        return undefined
    }
    completeTracking() {
        if (!this.isAsync) {
            if (Notifier.instance.effectTrackDepth <= maxMarkerBits) {
                finalizeDepMarkers(this)
            }

            ReactiveEffect.activeScopes.pop()
            Notifier.trackOpBit = 1 << --Notifier.instance.effectTrackDepth

        } else {
            // 如果是 async 的，只需要pop scope 就行了。因为全都是使用的正常 track，不是标记的。
            ReactiveEffect.activeScopes.pop()
        }
    }
    run(...args: any[]): any {
        // FIXME 执行到一般的 generator 如何处理？？应该形成队列还是直接取消？如果是 fullComputed，应该取消。
        //  如果是当成副作用，那么应该形成队列。
        if (this.isRunningAsync) {}

        // 一般用于调试
        if (!this.active) {
            return this.callGetter()
        }
        if (ReactiveEffect.activeScopes.includes(this)) {
            throw new Error('recursive effect call')
        }

        if(!this.isAsync) {
            try {
                this.prepareTracking()
                Notifier.instance.enableTracking()
                return this.callGetter()
            } finally {
                Notifier.instance.resetTracking()
                this.completeTracking()
            }
        } else {
            // async 执行中的时候产生了新的触发了重算怎么办？？？
            this.isRunningAsync = true
            const generator = this.callGetter() as Generator<any, string, boolean>
            const resultPromise = this.runGenerator(generator, (isFirst) => {
                this.prepareTracking(isFirst)
                Notifier.instance.enableTracking()
            }, (isLast) => {
                Notifier.instance.resetTracking()
                this.completeTracking()
            })

            resultPromise.then(() => {
                this.isRunningAsync = false
            })

            return resultPromise
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
    destroy() {
        ReactiveEffect.destroy(this)
    }
    async runGenerator(generator: Generator<any, string, boolean>, beforeRun: (isFirst?:boolean) => void, afterRun: (isLast?:boolean) => void)   {
        // run generator，每次之前要调用 beforeRun，每次之后要调用 afterRun
        let isFirst = true
        let lastYieldValue: any
        while(true) {
            beforeRun(isFirst)
            const {value, done} = generator.next(lastYieldValue)
            afterRun(done)
            lastYieldValue = value instanceof Promise ? await value : value
            isFirst = false
            if (done) break
        }
        return lastYieldValue
    }
}