import { insertBefore} from "./DOM";
import {Host} from "./Host";
import {createHost} from "./createHost";



export class StaticArrayHost implements Host{
    computed = undefined
    element: HTMLElement|DocumentFragment|Comment = this.placeholder
    childHosts: Host[] = []
    constructor(public source: any[], public placeholder: Comment) {
    }
    get parentElement() {
        return this.placeholder.parentElement
    }

    render(): void {
        if (this.element === this.placeholder) {
            this.source.forEach(item => {
                const newPlaceholder: Comment = new Comment('array item')
                insertBefore(newPlaceholder, this.placeholder)
                this.childHosts.push(createHost(item, newPlaceholder))
            })

            this.childHosts.forEach(host => host.render())
            // 因为 source 仍然有可能是 fragment 并且里面是空的，这个时候就还是等于没有元素。
            this.element = (this.childHosts.length ? this.childHosts[0].element : this.placeholder) as HTMLElement
        } else {
            throw new Error('should never rerender')
        }
    }
    destroy() {
        this.childHosts!.forEach(host => host.destroy())
        this.placeholder.remove()
    }
}