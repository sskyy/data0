import {ReactiveEffect} from "./reactiveEffect.js";


class Autorun extends ReactiveEffect{
    constructor(public fn: () => any) {
        super(true)
        this.run()
    }
    effectFn() {
        this.fn()
    }
}

export function autorun(fn: () => any) {
    const instance = new Autorun(fn)
    return () => {
        instance.destroy()
    }
}