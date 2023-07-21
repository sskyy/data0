import {computed} from "rata";

export interface Host {
    element: HTMLElement|Comment|Text|SVGElement
    placeholder:Comment
    computed?: ReturnType<computed<undefined>>
    render: () => void
    destroy : (parentHandleElement?: boolean) => void
    revoke?: () => void
}
