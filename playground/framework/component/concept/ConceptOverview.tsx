import { createElement} from "@framework";
import {atom, incMap, reactive} from "rata";
import {Code} from "../code/Code";
import {editor} from "monaco-editor";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;
import {Entity} from "../entity/Entity";
import {createFormForEntity} from "../createFormForEntityProperty";
import {createDialog, createDialogFooter} from "../createDialog";
import {RoleAttributive, EntityAttributive, Role} from "../activity/InteractionClass";

type Concept = {
    name: string,
    content?: string
}

type Attributive = {
    content?: object,
    // 代码形式
    stringContent?: string
    base: any
}





// 测试数据
const User = Role.createReactive( {
    name: 'User'
})

Role.createReactive( {
    name: 'Admin'
})

Role.createReactive( {
    name: 'Anonymous'
})

const NewAttr = RoleAttributive.createReactive({
    name: 'New',
    base: User,
    stringContent: `function New(){}`
})

export function ConceptOverview({ roles, attributives = reactive([NewAttr])}) {
    const selected = atom(null)

    const options: IStandaloneEditorConstructionOptions = {
        language: "javascript",
        automaticLayout: true,
        minimap: {
            enabled: false
        }
    }


    // TODO stringContent 指定编辑器怎么写？？？
    const { fieldValues: newRoleAttr, node: addEntityForm } = createFormForEntity(RoleAttributive, {fields: ['name', 'base']})
    const onCreateRoleAttr = () => {
        console.log(newRoleAttr)
        attributives.push(RoleAttributive.createReactive(newRoleAttr))
        roleAttrCreateDialogVisible(false)
    }

    const [roleAttrCreateDialogVisible, attrCreateDialog] = createDialog(
        addEntityForm,
        createDialogFooter([{ text: 'Submit', onClick: onCreateRoleAttr}, { text: 'Cancel', onClick: () => roleAttrCreateDialogVisible(false)}])
    )


    return (<div>
        <button type="button"
                onClick={() => roleAttrCreateDialogVisible(true)}
                className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            create role attributive
        </button>
        {attrCreateDialog}
        {incMap(attributives, attributive => (
            <div>
                <a onClick={() => selected(attributive)}>{attributive.name}</a>
            </div>
        ))}
        {() => selected() ?  <Code options={{value: selected().stringContent() || '', ...options}} />  : null}
    </div>)
}

