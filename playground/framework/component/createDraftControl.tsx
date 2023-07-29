import {createElement} from "@framework";
import {Component} from "../global";
import {deepClone} from "./createClass";

type Options = {
    pushEvent: string,
    constraints?: {},
    toControlValue? : (value: any) => any,
    toDraft? : (controlValue: any) => any,
}

export function createDraftControl(Component: Component, options?: Options) {

    return function renderControl(value) {
        let controlValue = options?.toControlValue? options.toControlValue(value) : deepClone(value())

        // TODO 这个 value 一定是 reactive 吗？好像一定得是个 atom，不然没法替换引用。
        function draft() {
            if (arguments.length === 0) {
                return controlValue
            }

            debugger

            controlValue = arguments[0]
            // if (!options?.pushEvent) {
                // TODO 怎么跑 contraints ？？只有成功了以后才修改 value
                value(options?.toDraft ? options.toDraft(controlValue) : controlValue)
            // }
        }

        // TODO 如果有 confirmEvent，怎么利用 axii 的机制监听到？？？

        return <Component value={draft} />
    }
}
