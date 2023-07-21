import {computed, destroyComputed, Atom} from "rata";
import {Host} from "./Host";

export class AtomHost implements Host{
    computed: ReturnType<typeof computed>
    fragmentParent = document.createDocumentFragment()
    element: Text|Comment = this.placeholder
    constructor(public source: Atom, public placeholder:Comment) {
    }
    get parentElement() {
        return this.placeholder.parentElement || this.fragmentParent
    }

    replace(value: any) {
        if (this.element === this.placeholder) {
            const textNode = new Text((value as string).toString())
            this.parentElement.replaceChild(textNode, this.placeholder)
            this.element = textNode
        } else {
            this.element.nodeValue = (value as string).toString()
        }
    }

    render(): void {
        this.computed = computed(() => {
                this.replace(this.source())
            }
        )
    }
    destroy() {
        destroyComputed(this.computed)
        this.element.remove()
        this.placeholder.remove()
    }

}