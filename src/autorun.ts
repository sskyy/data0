import {DirtyCallback, Computed} from "./computed.js";

// type AutorunContext = {
//     onCleanup(fn: () => any): void
// }
//
// class Autorun extends ReactiveEffect{
//     public lastCleanupFn?: () => void
//
//     constructor(public fn: (context: AutorunContext) => any) {
//         super(fn)
//         this.run()
//     }
//     createGetterContext(): AutorunContext {
//         return {
//             onCleanup: (fn: () => any) => this.lastCleanupFn = fn,
//         }
//     }
//
//     callGetter() {
//         if (this.lastCleanupFn) this.lastCleanupFn()
//         this.fn(this.createGetterContext())
//     }
//     destroy() {
//         if (this.lastCleanupFn) this.lastCleanupFn()
//         super.destroy()
//     }
// }

export function autorun(fn: () => any, scheduleRerun?: DirtyCallback) {
    const instance = new Computed(fn, undefined, scheduleRerun || true)
    instance.runEffect()
    // const instance = new Autorun(fn)
    return () => {
        instance.destroy()
    }
}