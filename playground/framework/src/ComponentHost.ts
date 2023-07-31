import {UnhandledPlaceholder, createElement, JSXElementType, AttributesArg} from "./DOM";
import {Host} from "./Host";
import {createHost} from "./createHost";
import {Component, ComponentNode, Props} from "../global";
import {reactive} from "rata";


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
    public ref = reactive({})
    public config? : Config
    public children: any
    constructor({ type, props, children }: ComponentNode, public placeholder: UnhandledPlaceholder) {
        this.type = type
        this.props = props
        if(children[0] instanceof Config) {
            this.config = children[0]
        } else {
            this.children = children
        }
    }
    get parentElement() {
        return this.placeholder.parentElement
    }
    // CAUTION innerHost 可能是动态的，所以 element 也可能会变，因此每次都要实时去读
    get element() : HTMLElement|Comment|SVGElement|Text {
        return this.innerHost?.element || this.placeholder
    }

    createElement = (type: JSXElementType, rawProps : AttributesArg, ...children: any[]) : ReturnType<typeof createElement> => {

        let name
        if (rawProps) {
            Object.keys(rawProps).forEach(key => {
                if (key[0] === '$') {
                    name = key.slice(1, Infinity)
                    // 为了性能，直接使用了 delete
                    delete rawProps[key]
                }

            })
        }


        if (name && this.config?.items[name]) {
            // 为了性能，又直接操作了 rawProps
            Object.assign(rawProps, this.config!.items[name].props || {})
            // TODO 支持其他 config
        }

        const element = createElement(type, rawProps, ...children)

        if (name) {
            this.ref[name] = element
        }

        return element
    }

    // TODO 需要用 computed 限制一下自己的变化范围？？？
    render(): void {
        if (this.element !== this.placeholder) {
            // CAUTION 因为现在没有 diff，所以不可能出现 Component rerender
            throw new Error('should never rerender')
        }
        componentRenderFrame.push(this)
        const node = this.type(this.props, {createElement: this.createElement, ref: this.ref})
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


class Config {
    constructor(public items: object) {}
}

export function configure(items: object) {
    return new Config(items)
}