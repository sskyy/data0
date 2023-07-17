import {containerToUnhandled, containerToUnhandledAttr, setAttribute, UnhandledPlaceholder, insertBefore} from "./DOM";
import {Host} from "./Host";
import {computed, destroyComputed, isAtom, isReactive} from "rata";
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
            // TODO 这里有问题  fragment 下面第一个 childeNodes 不一定是
            const firstEl = this.source instanceof DocumentFragment ? this.source.childNodes[0] : this.source
            insertBefore(this.source, this.placeholder)
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