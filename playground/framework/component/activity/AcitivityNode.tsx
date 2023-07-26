import {createElement} from "@framework";
import { InteractionNode } from "./InteractionNode";
import {InteractionGroupNode} from "./InteractionGroupNode";


export function ActivityNode({ node }) {
    return node.isGroup ? <InteractionGroupNode group={node.raw}/> : <InteractionNode interaction={node.raw}/>
}

