import type { Assertion, AsymmetricMatchersContaining } from 'vitest'

type toPrimitiveType = {
    [Symbol.toPrimitive]: Function
}
interface CustomMatchers<R = unknown> {
    toShallowMatchObject(x: any[]): R
    toShallowMatchObject(x: Object): R
    toShallowEqual(x: number|string): R
    toShallowEqual(x: toPrimitiveType): R
}

declare module 'vitest' {
    interface Assertion<T = any> extends CustomMatchers<T> {}
    interface AsymmetricMatchersContaining extends CustomMatchers {}
}