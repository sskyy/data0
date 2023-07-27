import {createElement} from '@framework'
import {Input} from "../form/Input";
import {incMap} from "rata";


// TODO 期望的写法，给我的就是 editingValue，我来指定 push draft 的时机
export function ActionInput2({ value, push, errors }) {

    // 如果有外部修改，可以通过 isOutdated 来判断，通过 sync 来让用户选择要不要覆盖当前的值。

    return (
        <div>
            <div>
                <input value={draftValue} onBlur={() => push(draftValue)}/>
            </div>
            <div>{incMap(errors, (error) => (<div>{error.message}</div>))}</div>
        </div>
    )
}


export function ActionInput({ value }) {
    return <input placeholder="action name" value={value.name()}/>
}