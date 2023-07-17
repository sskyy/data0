import {computed, destroyComputed, Atom} from "rata";
import {Host} from "./Host";

export class AtomHost implements Host{
    computed: ReturnType<typeof computed>
    fragmentParent = document.createDocumentFragment()
    element: Text|Comment = this.placeholder
    constructor(public source: Atom<any>, public placeholder:Comment) {
    }
    get parentElement() {
        return this.placeholder.parentElement || this.fragmentParent
    }

    replace(value: string|number) {
        if (this.element === this.placeholder) {
            const textNode = new Text(value.toString())
            this.parentElement.replaceChild(textNode, this.placeholder)
            this.element = textNode
        } else {
            this.element.nodeValue = value.toString()
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