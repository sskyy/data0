/* @jsx createElement*/
import {createElement, createRoot} from "@framework";
import "./index.css"
import {InteractionNode} from "./component/activity/InteractionNode";
import {Action, Interaction, Payload, Role, RoleAttributive} from "./component/activity/InteractionClass";

const globalUserRole = Role.createReactive({ name: 'User'})

const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    roleAttributive: RoleAttributive.createReactive({
        // TODO 写个 attributive
    }),
    role: globalUserRole,
    roleAs: 'A',
    action: Action.createReactive({ name: 'sendRequest'}),
    payload: Payload.createReactive({
        content: {
            to: {
                // TODO 还要支持 as B
            },
            message: {
                // TODO 从实体导入的
            }
        }
    })
})

const root = createRoot(document.getElementById('root')!)
root.render(<InteractionNode interaction={sendInteraction} />)


