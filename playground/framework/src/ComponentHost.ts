import {UnhandledPlaceholder} from "./DOM";
import {Host} from "./Host";
import {createHost} from "./createHost";
import {Component, ComponentNode, Props} from "../global";


const componentRenderFrame: ComponentHost[] = []

export function onDestroy(destroyCallback: () => any) {
    componentRenderFrame.at(-1)!.onDestroy = destroyCallback
}

export class ComponentHost implements Host{
    // CAUTION Component 只因为 props 的引用变化而重新 render。
    //  只有有 diff 算发以后才会出现引用变化的情况，现在我们还没有实现。所以现在其实永远不会重 render
    computed = undefined
    type: Component
    innerHost?: Host
    props: Props
    public onDestroy?: () => any
    constructor({ type, props }: ComponentNode, public placeholder: UnhandledPlaceholder) {
        this.type = type
        this.props = props
    }
    get parentElement() {
        return this.placeholder.parentElement
    }
    // CAUTION innerHost 可能是动态的，所以 element 也可能会变，因此每次都要实时去读
    get element() : HTMLElement|Comment|SVGElement|Text {
        return this.innerHost?.element || this.placeholder
    }

    // TODO 需要用 computed 限制一下自己的变化范围？？？
    render(): void {
        if (this.element !== this.placeholder) {
            // CAUTION 因为现在没有 diff，所以不可能出现 Component rerender
            throw new Error('should never rerender')
        }
        componentRenderFrame.push(this)
        const node = this.type(this.props)
        componentRenderFrame.pop()
        // 就用当前 component 的 placeholder
        this.innerHost = createHost(node, this.placeholder)
        this.innerHost.render()
    }
    destroy(parentHandle?: boolean) {
        this.innerHost!.destroy(parentHandle)
        this.onDestroy?.()
        if (!parentHandle) {
            this.placeholder.remove()
        }
    }
}