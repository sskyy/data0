import {expect} from '@jest/globals'

// Global compile-time constants
declare var __DEV__: boolean

// for tests
declare module 'expect' {
    interface AsymmetricMatchers extends expect{
        toShallowEqual(toMatch: string|number): void;
    }
    interface Matchers<R> {
        toShallowEqual(toMatch: string|number): R;
    }
}

export type Props = {
    [k: string]: any,
    children?: ChildNode[]
}
export type Component = (props?: Props) => HTMLElement|Text|DocumentFragment|null|undefined|string|number|Function
export type ComponentNode = {
    type: Component,
    props : Props,
}

declare global {
    var __DEV__: boolean
    namespace JSX {
        interface IntrinsicElements {
            // allow arbitrary elements
            // @ts-ignore suppress ts:2374 = Duplicate string index signature.
            [name: string]: any
        }
        interface Element extends  ComponentNode {}
    }
}

