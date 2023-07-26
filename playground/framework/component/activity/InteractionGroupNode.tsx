import {createElement} from "@framework";
import { InteractionNode } from "./InteractionNode";
import {incMap} from "rata";

export function InteractionGroupNode({ group }){
    return (
        <div className="inline-block">
            <div className="text-center">
                {group.type}
            </div>
            <div className="inline-flex gap-x-2">
                {incMap(group.interactions, interaction => <InteractionNode interacton={interaction}/>)}
            </div>
        </div>
    )
}
