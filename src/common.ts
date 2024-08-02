import {DirtyCallback, Computed, GetterContext} from "./computed.js";

// CAUTION  autorun/once 是用来执行用户代码的。
//  一定自己不能有 digest session 或者在其他的 digest session 中，
//  因为用户很可能在 autorun 中进行reactive操作然后立刻读 computed，并且期望 computed 是立刻执行的，保持数据一致性。
//  所以创建的时候通过 preventEffectSession 来控制自己，通过 schedule 默认为 nextJob 来控制不在其他中。
const nextJob = (run:(...args:[]) => any) => Promise.resolve().then(run)

export function autorun(fn: (context: GetterContext) => any, scheduleRerun: DirtyCallback|true = nextJob) {
    const instance = new Computed(fn, undefined, scheduleRerun, undefined, undefined, undefined, true)
    instance.run([], true)
    // const instance = new Autorun(fn)
    return () => {
        instance.destroy()
    }
}

export function once(fn:() => any, scheduleRerun: DirtyCallback|true = nextJob) {
    let stopFn: () => any
    let instance:Computed|undefined = new Computed(() => {
        const shouldStop = fn()
        if (shouldStop) {
            stopFn!()
        }
    }, undefined, scheduleRerun, undefined, undefined, undefined, true)

    stopFn = () => {
        instance?.destroy()
        instance = undefined
    }
    // const instance = new Autorun(fn)
    instance.run([], true)
    // 也支持外部手动 stop
    return stopFn
}
