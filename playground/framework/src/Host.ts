import {computed} from "rata";
import {UnhandledPlaceholder} from "./DOM";
import {removeNodesBetween} from "./util";
import {Props} from "../global";


export interface Host {
    element: HTMLElement|Comment
    placeholder:UnhandledPlaceholder
    computed?: ReturnType<computed<undefined>>
    render: () => void
    destroy : () => void
    revoke?: () => void
}
