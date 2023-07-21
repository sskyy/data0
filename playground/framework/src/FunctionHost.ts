import {computed, destroyComputed} from "rata";
import {Host} from "./Host";
import {createHost} from "./createHost";
import {insertBefore} from './DOM'

// CAUTION 纯粹的动态结构，有变化就重算，未来考虑做 dom diff, 现在不做
type FunctionNode = () => ChildNode|DocumentFragment|string|number|null|boolean

export class FunctionHost implements Host{
    computed: ReturnType<typeof computed>
    fragmentParent = document.createDocumentFragment()
    element: HTMLElement|Comment|Text|SVGElement = this.placeholder
    innerHost?: Host
    constructor(public source: FunctionNode, public placeholder:Comment) {
    }
    get parentElement() {
        return this.placeholder.parentElement || this.fragmentParent
    }

    render(): void {
        this.computed = computed(() => {
                // CAUTION 每次都清空上一次的结果
                if (this.element !== this.placeholder) {
                    this.innerHost?.destroy()
                }

                const node = this.source()

                const newPlaceholder = new Comment('computed node')
                insertBefore(newPlaceholder, this.placeholder)
                this.innerHost = createHost(node, newPlaceholder)
                this.innerHost.render()

            this.element = this.innerHost.element
            }
        )
    }
    destroy() {
        destroyComputed(this.computed)
        this.innerHost!.destroy()
        this.placeholder.remove()
    }
}