
export const debugTarget = new WeakSet<Function>()
export function isDebugTarget(target: Function) {
    return debugTarget.has(target)
}

export function debug(getter: Function) {
    debugTarget.add(getter)
    return getter
}

// 有 debug 就有 as，但是有 as 不一定有 debug
type FunctionWithDebug<T extends Function> = T & {
    debug: T
}


export const reactiveTargetName = new WeakMap<any, string>()


type AnyFn = (...arg: any[]) => any
type DebugWithNameProxyType<T extends AnyFn> = {
    [k: string] : FunctionWithDebug<T>
}

type NameProxyType<T extends AnyFn> = {
    [k: string] : T
}


export function createDebugWithName<T extends AnyFn>(originFn: T): DebugWithNameProxyType<T>
export function createDebugWithName(origin: AnyFn){
    return new Proxy({}, {
        get(p, name: string) {

            // computed.as.xxx(() => {}) 的用法
            const naming = function(...args: any[]) {
                setDebugName(args[0], name)
                return origin(...(args as Parameters<typeof origin>))
            }

            // computed.as.xxx.debug(() => {}) 的用法
            const debugFn = createDebug(origin)
            naming.debug = function (...args: any[]) {
                setDebugName(args[0], name)
                return debugFn(...(args as Parameters<typeof origin>))
            }

            return naming
        }
    })
}



export function createName<T extends AnyFn>(originFn: T): NameProxyType<T>
export function createName(origin: AnyFn){
    return new Proxy({}, {
        get(p, name: string) {
            // computed.as.xxx(() => {}) 的用法
            return function(...args: any[]) {
                setDebugName(args[0], name)
                return origin(...(args as Parameters<typeof origin>))
            }
        }
    })
}



export function createDebug<T extends AnyFn>(originFn: T): T
export function createDebug(originFn: AnyFn) {
    return function debug(...arg: any[]){
        debugTarget.add(arg[0])
        return originFn(...arg)
    }
}


export function getDebugName(target: any) {
    return reactiveTargetName.get(target)
}

export function setDebugName(target: any, name: string) {
    return reactiveTargetName.set(target, name)
}



