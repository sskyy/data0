import {createElement} from "@framework";
import { InteractionNode } from "./InteractionNode";
import {incMap} from "rata";

export function InteractionGroupNode({ group }){
    return (
        <div style={{border: "1px dashed red"}}>
            <div className="text-center">
                {group.type}
            </div>
        </div>
    )
}
