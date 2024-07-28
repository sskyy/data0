import {DirtyCallback, Computed, GetterContext} from "./computed.js";

export function autorun(fn: (context: GetterContext) => any, scheduleRerun?: DirtyCallback) {
    const instance = new Computed(fn, undefined, scheduleRerun || true)
    instance.run([], true)
    // const instance = new Autorun(fn)
    return () => {
        instance.destroy()
    }
}

export function once(fn:() => any) {
    let stopFn: () => any
    let instance:Computed|undefined = new Computed(() => {
        const shouldStop = fn()
        if (shouldStop) {
            stopFn!()
        }
    }, undefined, true)

    stopFn = () => {
        instance?.destroy()
        instance = undefined
    }
    // const instance = new Autorun(fn)
    instance.run([], true)
    // 也支持外部手动 stop
    return stopFn
}
