import {createElement} from "@framework";
import {Component} from "../global";
import {deepClone} from "./createClass";
import {isAtom} from "rata";
import {configure} from "../src/ComponentHost";

type Options = {
    pushEvent: string,
    constraints?: {},
    toControlValue? : (value: any) => any,
    toDraft? : (controlValue: any) => any,
}

export function createDraftControl(Component: Component, options?: Options) {
    return function renderControl(value, props = {}) {
        if (!isAtom(value)) {
            throw new Error('draft only accept atom value')
        }
        let controlValue = options?.toControlValue? options.toControlValue(value()) : deepClone(value())

        function draft() {
            if (arguments.length === 0) {
                return controlValue
            }

            controlValue = arguments[0]

            // TODO 这里要改成监听 value 的 onChange 事件。对于那些为了性能不改变 value 引用的组件，他们的应该自行触发 onChange 事件。
            if (!options?.pushEvent) {
                // TODO 怎么跑 contraints ？？只有成功了以后才修改 value
                // TODO toDraft 可能还没准备好，如何验证
                value(options?.toDraft ? options.toDraft(controlValue) : controlValue)
            }
        }

        let config = {}
        if (options?.pushEvent) {
            const [eleName, eventName] = options.pushEvent.split(':')
            config[eleName] = {
                props: {
                    [eventName]: () => {
                        const draftValue = options?.toDraft ? options.toDraft(controlValue) : controlValue
                        // CAUTION 引用相同，说明更新过一次以后，value 直接使用了我们产生的controlValue对象，所以这个时候需要 cloneDeep
                        const newValue = draftValue === value() ? deepClone(draftValue) : draftValue
                        console.log(newValue)
                        value(newValue)
                    }
                }
            }
        }

        // FIXME type
        // @ts-ignore
        return <Component value={draft} {...props}>{configure(config)}</Component>
    }
}
