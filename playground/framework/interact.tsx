/* @jsx createElement*/
import {createElement, createRoot} from "@framework";
import "./index.css"
import {InteractionNode} from "./component/activity/InteractionNode";
import {Action, Interaction, Payload, Role, RoleAttributive} from "./component/activity/InteractionClass";
import {reactive} from "rata";

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

const NewAttr = RoleAttributive.createReactive({
    name: 'New',
    stringContent: `function New(){}`
})

const New2Attr = RoleAttributive.createReactive({
    name: 'New2',
    stringContent: `function New2(){}`
})

const New3Attr = RoleAttributive.createReactive({
    name: 'New3',
    stringContent: `function New3(){}`
})


const OldAttr = RoleAttributive.createReactive({
    name: 'Old',
    stringContent: `function Old(){}`
})

const Old2Attr = RoleAttributive.createReactive({
    name: 'Old2',
    stringContent: `function Old2(){}`
})

const Old3Attr = RoleAttributive.createReactive({
    name: 'Old3',
    stringContent: `function Old3(){}`
})


const roleAttributives = reactive([NewAttr, New2Attr, New3Attr, OldAttr, Old2Attr, Old3Attr])

const User = Role.createReactive( {
    name: 'User'
})

const Admin = Role.createReactive( {
    name: 'Admin'
})

const Anonymous = Role.createReactive( {
    name: 'Anonymous'
})

const roles = reactive([User, Admin, Anonymous])


const root = createRoot(document.getElementById('root')!)
// TODO entities and entity attributives
root.render(<InteractionNode interaction={sendInteraction} roles={roles} roleAttributives={roleAttributives}/>)


