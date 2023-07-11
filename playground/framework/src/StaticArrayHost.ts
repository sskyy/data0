import {containerToUnhandled, containerToUnhandledAttr, insertBefore, setAttribute, UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import {computed, destroyComputed, isAtom, isReactive} from "rata";
import {createHost} from "./createHost";
import {removeNodesBetween} from "./util";



export class StaticArrayHost implements Host{
    computed = undefined
    element: ChildNode|DocumentFragment|Comment = this.placeholder
    childHosts: Host[] = []
    constructor(public source: any[], public placeholder: UnhandledPlaceholder) {
    }
    get parentElement() {
        return this.placeholder.parentElement
    }

    render(): void {
        if (this.element === this.placeholder) {
            this.source.forEach(item => {
                const newPlaceholder: UnhandledPlaceholder = new Comment('array item')
                insertBefore(newPlaceholder, this.placeholder)
                this.childHosts.push(createHost(item, newPlaceholder))
            })

            this.childHosts.forEach(host => host.render())
            // 因为 source 仍然有可能是 fragment 并且里面是空的，这个时候就还是等于没有元素。
            this.element = this.childHosts.length ? this.childHosts[0].element : this.placeholder
        } else {
            throw new Error('should never rerender')
        }
    }
    destroy() {
        this.childHosts!.forEach(host => host.destroy())
        this.placeholder.remove()
    }
}