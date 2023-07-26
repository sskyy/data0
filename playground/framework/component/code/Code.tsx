import {createElement} from "@framework";
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import './useWorker';
import {IMarkdownString} from "monaco-editor/esm/vs/editor/editor.api";

type HoverProp = { match : (...arg: any[]) => any, contents: (...arg: any[]) => IMarkdownString[]}

type CodeProp = {
    options?: Parameters<typeof monaco.editor.create>[1],
    extraLib?: [string, string],
    hover?: HoverProp[]
}

export function Code({ options, extraLib, hover }: CodeProp) {

    const container = <div style={{height: 500}}></div>

    // FIXME 需要真正组件挂载的声明周期，还要 destroy
    setTimeout(() => {

        if (extraLib) {
            monaco.languages.typescript.javascriptDefaults.addExtraLib(extraLib[0], extraLib[1]);
        }

        if (hover?.length) {
            monaco.languages.registerHoverProvider('javascript', {
                provideHover: function(model, position) {
                    // Log the current word in the console, you probably want to do something else here.
                    const text = model.getWordAtPosition(position)
                    for(let hoverItem of hover) {
                        const matched = hoverItem.match(text?.word)
                        if (matched) {
                            return {
                                range: new monaco.Range(position.lineNumber, text?.startColumn!, position.lineNumber, text?.endColumn!),
                                contents: hoverItem.contents(matched)
                            };

                        }
                    }
                }
            });
        }


        monaco.editor.create(container as HTMLElement, options);
    })

    return container
}
