import { UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import { isAtom, isReactive} from "rata";
import {FragHost} from "./FragHost";
import {ComponentHost} from "./ComponentHost";
import {AtomHost} from "./AtomHost";
import {FunctionHost} from "./FunctionHost";
import {StaticHost} from "./StaticHost";
import {StaticArrayHost} from "./StaticArrayHost";

class EmptyHost implements Host{
    element: Text|Comment
    placeholder:Comment
    render() { return }
    destroy() {}
}

export function createHost(source: any, placeholder: UnhandledPlaceholder) {
    if (!(placeholder instanceof Comment)) throw new Error('incorrect placeholder type')
    let host:Host
    if ( Array.isArray(source)  ) {
        if(isReactive(source) ) {
            host = new FragHost(source, placeholder)
        } else {
            host = new StaticArrayHost(source, placeholder)
        }

    } else if( typeof source === 'object' && typeof source?.type === 'function') {
        host = new ComponentHost(source, placeholder)
    } else if (isAtom(source)) {
        host = new AtomHost(source, placeholder)
    } else if (typeof source === 'function'){
        host  = new FunctionHost(source, placeholder)
    } else if( source instanceof HTMLElement || source instanceof DocumentFragment || Array.isArray(source)){
        host = new StaticHost(source, placeholder)
    } else if (source === undefined || source === null){
        host = new EmptyHost()
    } else {
        throw new Error(`unknown child type ${source}`)
    }

    return host
}