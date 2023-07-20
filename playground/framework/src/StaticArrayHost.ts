import { insertBefore} from "./DOM";
import {Host} from "./Host";
import {createHost} from "./createHost";
import {removeNodesBetween} from "./util";



export class StaticArrayHost implements Host{
    computed = undefined
    element: HTMLElement|Comment = this.placeholder
    childHosts: Host[] = []
    constructor(public source: any[], public placeholder: Comment) {
    }
    get parentElement() {
        return this.placeholder.parentElement
    }

    render(): void {
        if (this.element === this.placeholder) {
            this.source.forEach(item => {
                if (typeof item === 'string' || typeof item === 'number') {
                    const el = document.createTextNode(item.toString())
                    if (this.element === this.placeholder) this.element = el
                    insertBefore(el, this.placeholder)
                } else if ( item instanceof Text) {
                    // Component 或者 Function 返回值可能会是 DocumentFragment，而 DocumentFragment.childNodes 也会使用 StaticArrayHost 处理，
                    //  这个时候的 this.source 就是 childNodes，已经是 DOM.js 处理过的了，所以直接是 Text 节点。
                    if (this.element === this.placeholder) this.element = item
                    insertBefore(item, this.placeholder)
                } else {
                    // 其他未知节点了
                    const newPlaceholder: Comment = new Comment('array item')
                    insertBefore(newPlaceholder, this.placeholder)
                    this.childHosts.push(createHost(item, newPlaceholder))
                }
            })

            this.childHosts.forEach(host => host.render())
        } else {
            throw new Error('should never rerender')
        }
    }
    destroy() {
        this.childHosts!.forEach(host => host.destroy())
        removeNodesBetween(this.element, this.placeholder, true)
    }
}