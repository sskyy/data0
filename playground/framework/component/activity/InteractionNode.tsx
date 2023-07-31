import {createElement} from "@framework";
import {AttributiveInput} from "./AttributiveInput";
import {RoleInput} from "./RoleInput";
import {PayloadInput} from "./PayloadInput";
import {Select} from "../form/Select";
import {ActionInput} from "./ActionInput";
import {createDraftControl} from "../createDraftControl";

export function InteractionNode({ interaction }){

    const renderActionDraftControl = createDraftControl(ActionInput, {
        pushEvent: 'input:onBlur'
    })

    const renderPayloadDraftControl = createDraftControl(PayloadInput, {
        pushEvent: 'code:onBlur',
        toControlValue: () => '',
        toDraft: () => ({})
    })

    return (
        <div style={{border: '1px blue dashed', display: 'inline-block'}}>
            <div>
                <AttributiveInput value={interaction.roleAttributive().content} />
                {/*<RoleInput />*/}
                <span>{interaction.role().name()}</span>
            </div>
            <div>
                {renderActionDraftControl(interaction.action().name)}
            </div>
            <div style={{ width: 200, height:100, overflow: 'auto'}}>
                {renderPayloadDraftControl(interaction.payload)}
            </div>
        </div>
    )
}
