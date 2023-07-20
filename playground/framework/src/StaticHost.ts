import {containerToUnhandled, containerToUnhandledAttr, setAttribute, UnhandledPlaceholder, insertBefore} from "./DOM";
import {Host} from "./Host";
import {computed, destroyComputed, isAtom} from "rata";
import {createHost} from "./createHost";
import {removeNodesBetween} from "./util";


function renderReactiveChildAndAttr(result: HTMLElement|ChildNode|DocumentFragment) {
    if (!(result instanceof HTMLElement || result instanceof DocumentFragment)) return

    const unhandledChild = containerToUnhandled.get(result)

    const reactiveHosts:  Host[]=
        unhandledChild ?
            unhandledChild.map(({ placeholder, child}) => createHost(child, placeholder)) :
            []

    const attrComputeds: ReturnType<typeof computed>[] = []
    const unhandledAttr = containerToUnhandledAttr.get(result)
    unhandledAttr?.forEach(({ el, key, value}) => {
        // CAUTION 刚好读 atom 和 function 都是执行函数的写法。
        if (isAtom(value) || typeof value === 'function') {
            attrComputeds.push(computed(() => {
                // if (key === 'value') debugger
                setAttribute(el, key, value())
            }))

            // TODO 表单组件，要变成受控的形式，还要考虑值不是 atom 的情况，是不是要写到 DOM 里面？
            if (key === 'value') {

            }

        } else {
            throw new Error(`unknown attr ${key}: ${value}`)
        }
    })

    return {
        reactiveHosts,
        attrComputeds,
        renderHosts: () => reactiveHosts.forEach(host => host.render())
    }
}

function findFirstSelfChildNode(el) {
    for(let child of el.childNodes) {
        if (child instanceof Text || child instanceof HTMLElement) {
            return child
        }
        // CAUTION 这里不会出现 childNodes 里面还有 Fragment 之类的情况，因为在 DOM.js 中碰到静态的 Fragment 已经直接吸收了。
    }
}

export class StaticHost implements Host{
    // CAUTION Component 只因为 props 的引用变化而重新 render。
    //  只有有 diff 算发以后才会出现引用变化的情况，现在我们还没有实现。所以现在其实永远不会重 render
    computed = undefined
    reactiveHosts?: Host[]
    attrComputeds?: ReturnType<typeof computed>[]
    constructor(public source: HTMLElement, public placeholder: UnhandledPlaceholder) {
    }
    get parentElement() {
        return this.placeholder.parentElement
    }
    element: HTMLElement|Comment = this.placeholder
    render(): void {
        if (this.element === this.placeholder) {
            this.element = this.source
            insertBefore(this.source, this.placeholder)
            const { reactiveHosts, attrComputeds, renderHosts } = renderReactiveChildAndAttr(this.source)!
            this.reactiveHosts = reactiveHosts
            this.attrComputeds = attrComputeds
            renderHosts()
        } else {
            throw new Error('should never rerender')
        }
    }
    destroy() {
        this.reactiveHosts!.forEach(host => host.destroy())
        this.attrComputeds!.forEach(attrComputed => destroyComputed(attrComputed))
        removeNodesBetween(this.element!, this.placeholder, true)
    }
}