import {UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import {createHost} from "./createHost";
import {Component, ComponentNode, Props} from "../global";


export class ComponentHost implements Host{
    // CAUTION Component 只因为 props 的引用变化而重新 render。
    //  只有有 diff 算发以后才会出现引用变化的情况，现在我们还没有实现。所以现在其实永远不会重 render
    computed = undefined
    element: ChildNode|DocumentFragment|Comment = this.placeholder
    type: Component
    innerHost?: Host
    props: Props

    constructor({ type, props }: ComponentNode, public placeholder: UnhandledPlaceholder) {
        this.type = type
        this.props = props
    }
    get parentElement() {
        return this.placeholder.parentElement
    }
    // TODO 需要用 computed 限制一下自己????
    render(): void {
        if (this.element !== this.placeholder) {
            // CAUTION 因为现在没有 diff，所以不可能出现 Component rerender
            throw new Error('should never rerender')
        }
        const node = this.type(this.props)
        // 就用当前 component 的 placeholder
        this.innerHost = createHost(node, this.placeholder)
        this.innerHost.render()

        this.element = this.innerHost.element
    }
    destroy() {
        this.innerHost!.destroy()
    }
}