import {containerToUnhandled, containerToUnhandledAttr, setAttribute, UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import {computed, isAtom, isReactive} from "rata";
import {FragHost} from "./FragHost";
import {ComponentHost} from "./ComponentHost";
import {AtomHost} from "./AtomHost";
import {FunctionHost} from "./FunctionHost";
import {StaticHost} from "./StaticHost";
import {StaticArrayHost} from "./StaticArrayHost";

export function createHost(source: any, placeholder: UnhandledPlaceholder) {
    let host:Host
    if ( Array.isArray(source)  ) {
        if(isReactive(source) ) {
            host = new FragHost(source, placeholder)
        } else {
            host = new StaticArrayHost(source, placeholder)
        }

    } else if( typeof source === 'object' && typeof source.type === 'function') {
        host = new ComponentHost(source, placeholder)
    } else if (isAtom(source)) {
        host = new AtomHost(source, placeholder)
    } else if (typeof source === 'function'){
        host  = new FunctionHost(source, placeholder)
    } else if( source instanceof HTMLElement || source instanceof DocumentFragment || Array.isArray(source)){
        host = new StaticHost(source, placeholder)
    } else {
        throw new Error(`unknown child type ${source}`)

    }

    return host
}