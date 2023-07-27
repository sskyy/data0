import {createElement} from "@framework";
import {AttributiveInput} from "./AttributiveInput";
import {RoleInput} from "./RoleInput";
import {PayloadInput} from "./PayloadInput";
import {Select} from "../form/Select";
import {ActionInput} from "./ActionInput";

export function InteractionNode({ interaction }){
    console.log(interaction.role())

    return (
        <div style={{border: '1px blue dashed', display: 'inline-block'}}>
            <div>
                <AttributiveInput value={interaction.roleAttributive().content}/>
                {/*<RoleInput />*/}
                <span>{interaction.role().name()}</span>
            </div>
            <div>
                <ActionInput value={interaction.action()}/>
            </div>
            <div style={{ width: 200, height:100, overflow: 'auto'}}>
                <PayloadInput />
            </div>
        </div>
    )
}
