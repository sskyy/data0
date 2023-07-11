
import {createHost} from "./createHost";
import {ComponentNode} from "../global";


export function createRoot(element: HTMLElement) {
    const placeholder = new Comment('root')
    element.appendChild(placeholder)

    return {
        render(componentOrEl: HTMLElement|ComponentNode|Function) {
            const host = createHost(componentOrEl, placeholder)
            host.render()
            return host
        }
    }
}

export  {createElement, Fragment} from './DOM'








