import { UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import { isAtom, isReactive} from "rata";
import {ReactiveArrayHost} from "./ReactiveArrayHost";
import {ComponentHost} from "./ComponentHost";
import {AtomHost} from "./AtomHost";
import {FunctionHost} from "./FunctionHost";
import {StaticHost} from "./StaticHost";
import {StaticArrayHost} from "./StaticArrayHost";

class EmptyHost implements Host{
    element = new Comment('empty')
    placeholder = this.element
    // TODO 仍然 append placeholder，这样可以使得 staticArray 等的 firstElement 一路委托下来。
    render() { return }
    destroy() {}
}

export function createHost(source: any, placeholder: UnhandledPlaceholder) {
    if (!(placeholder instanceof Comment)) throw new Error('incorrect placeholder type')
    let host:Host
    if ( Array.isArray(source)  ) {
        if(isReactive(source) ) {
            host = new ReactiveArrayHost(source, placeholder)
        } else {
            host = new StaticArrayHost(source, placeholder)
        }

    } else if( typeof source === 'object' && typeof source?.type === 'function') {
        host = new ComponentHost(source, placeholder)
    } else if (isAtom(source)) {
        host = new AtomHost(source, placeholder)
    } else if (typeof source === 'function'){
        host  = new FunctionHost(source, placeholder)
    } else if( source instanceof HTMLElement || source instanceof SVGElement){
        host = new StaticHost(source, placeholder)
    } else if( source instanceof DocumentFragment){
        host = new StaticArrayHost([...(source.childNodes as unknown as Array<HTMLElement>)], placeholder)
    } else if (source === undefined || source === null){
        host = new EmptyHost()
    } else {
        throw new Error(`unknown child type ${source}`)
    }

    return host
}