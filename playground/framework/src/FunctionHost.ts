import {computed} from "rata";
import {Host} from "./Host";
import {createHost} from "./createHost";

// CAUTION 纯粹的动态结构，有变化就重算，未来考虑做 dom diff, 现在不做
type FunctionNode = () => ChildNode|DocumentFragment|string|number|null|boolean

export class FunctionHost implements Host{
    computed: ReturnType<typeof computed>
    fragmentParent = document.createDocumentFragment()
    element: ChildNode|DocumentFragment|Comment = this.placeholder
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
                // 就用当前 component 的 placeholder
                this.innerHost = createHost(node, this.placeholder)
                this.innerHost.render()

            this.element = this.innerHost.element
            }
        )
    }
    destroy() {
        this.innerHost!.destroy()
        // 不需要管元素，因为 innerHost 会管，而且用了我们的 placeholder，所以 placeholder 也会一起处理。
    }
}