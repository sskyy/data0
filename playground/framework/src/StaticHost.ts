import {UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import {computed, destroyComputed} from "rata";
import {renderReactiveChildAndAttr} from "./reactify";
import {removeNodesBetween} from "./util";

export class StaticHost implements Host{
    // CAUTION Component 只因为 props 的引用变化而重新 render。
    //  只有有 diff 算发以后才会出现引用变化的情况，现在我们还没有实现。所以现在其实永远不会重 render
    computed = undefined
    element: ChildNode|DocumentFragment|Comment = this.placeholder
    reactiveHosts?: Host[]
    attrComputeds?: ReturnType<typeof computed>[]
    constructor(public source: ChildNode|DocumentFragment, public placeholder: UnhandledPlaceholder) {
    }
    get parentElement() {
        return this.placeholder.parentElement
    }

    render(): void {
        if (this.element === this.placeholder) {
            const firstEl = this.source instanceof DocumentFragment ? this.source.childNodes[0] : this.source
            this.parentElement!.insertBefore(this.source, this.placeholder)
            const { reactiveHosts, attrComputeds, renderHosts } = renderReactiveChildAndAttr(this.source)!
            this.reactiveHosts = reactiveHosts
            this.attrComputeds = attrComputeds

            renderHosts()
            // 因为 source 仍然有可能是 fragment 并且里面是空的，这个时候就还是等于没有元素。
            this.element = firstEl ? firstEl : this.placeholder
        } else {
            throw new Error('should never rerender')
        }
    }
    destroy() {
        this.reactiveHosts!.forEach(host => host.destroy())
        this.attrComputeds!.forEach(attrComputed => destroyComputed(attrComputed))

        removeNodesBetween(this.element as ChildNode, this.placeholder, true)
    }
}