import {containerToUnhandled, containerToUnhandledAttr, setAttribute, UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import {computed, isAtom, isReactive} from "rata";
import {FragHost} from "./FragHost";
import {ComponentHost} from "./ComponentHost";
import {AtomHost} from "./AtomHost";
import {FunctionHost} from "./FunctionHost";
import {StaticHost} from "./StaticHost";


export function renderReactiveChildAndAttr(result: HTMLElement|ChildNode|DocumentFragment) {
    if (!(result instanceof HTMLElement || result instanceof DocumentFragment)) return

    const unhandledChild = containerToUnhandled.get(result)

    const reactiveHosts:  Host[]=
        unhandledChild ?
        unhandledChild.map(({ placeholder, child}) => createHost(child, placeholder)) :
        []

    const attrComputeds: ReturnType<typeof computed>[] = []
    const unhandledAttr = containerToUnhandledAttr.get(result)
    unhandledAttr?.forEach(({ el, key, value}) => {
        if (!value) debugger
        if ( isReactive(value) ) {
            attrComputeds.push(computed(() => {
                setAttribute(el, key, value())
            }))
        } else {
            throw new Error(`unknown attr ${key}: ${value}`)
        }
    })

    return {
        reactiveHosts,
        attrComputeds,
        renderHosts: () => reactiveHosts.forEach(host => host.render())
    }
}


export function createHost(source: any, placeholder: UnhandledPlaceholder) {
    let host:Host
    if ( Array.isArray(source) && isReactive(source) ) {
        host = new FragHost(source, placeholder)
    } else if( typeof source === 'object' && typeof source.type === 'function') {
        host = new ComponentHost(source, placeholder)
    } else if (isAtom(source)) {
        host = new AtomHost(source, placeholder)
    } else if (typeof source === 'function'){
        host  = new FunctionHost(source, placeholder)
    } else if( source instanceof HTMLElement || source instanceof DocumentFragment){
        host = new StaticHost(source, placeholder)
    } else {
        throw new Error(`unknown child type ${source}`)

    }

    return host
}