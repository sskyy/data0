import {createElement} from "@framework";
import { parse } from "./attrParser";

console.log(parse('A && !B || C || D && (E || !F)'))

export function Attributive({ options }) {
    return <div contenteditable={true}></div>
}
