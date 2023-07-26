import {createElement} from "@framework";
import '../code/useWorker';
import {Code} from "../code/Code";
import {editor} from "monaco-editor/esm/vs/editor/editor.api";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;

export function PayloadInput() {
    const concepts = [{
        type: 'role',
        name: 'Anonymous'
    }, {
        type: 'role',
        name: 'Admin'
    },{
        type: 'attributive',
        name: 'New',
        base: 'User',
        content: `user.registration.time < 24`
    }, {
        type: 'attributive',
        name: 'Test',
        base: 'User',
        content: `user.label === 'test'`
    }]

        const libSource = concepts.map(concept => {
            if (concept.type === 'role') {
                return `declare class ${concept.name} {
                    static of(exp: boolean): boolean
                }`
            } else {
                // attributive
                return `declare function ${concept.name} (${concept.base.toLowerCase()}) {
                    return ${concept.content}
                }`
            }

        }).join("\n");
        const libUri = "ts:filename/facts.d.ts";
        const extraLib = [libSource, libUri]


        const hover = [{
            match: (word) => concepts.find(c => c.name === word),
            contents: (concept) => [
                { value: concept.content }
            ]
        }]

        // TODO 监听 value 变化？？？

        const options: IStandaloneEditorConstructionOptions = {
            value: "const a = Test",
            language: "javascript",
            automaticLayout: true,
            // lineNumbers: "off",
            overviewRulerLanes: 0,
            renderLineHighlight: "none",
            minimap: {
                enabled: false
            }
        }

    return <div>
        <Code options={options} extraLib={extraLib} hover={hover}/>
    </div>
}
