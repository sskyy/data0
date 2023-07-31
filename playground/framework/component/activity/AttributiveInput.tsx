import {AttrNode, AttrNodeTypes, OperatorNames, parse} from "./attrParser";
import {atom, computed} from "rata";
import {nextJob} from "../../src/util";
import {InjectHandles, Props} from "../../global";
import {createDraftControl} from "../createDraftControl";
import {Contenteditable} from "../contenteditable/Contenteditable";

console.log(parse('A && !B || C || D && (E || !F)'))


function renderAttrExpression(createElement, expression?: AttrNode, mayNeedParams?: boolean, placeholder?: string) {
    if (!expression) return <div>{placeholder}</div>

    if ( expression.type === AttrNodeTypes.variable) {
        return <a href="#" style={{color: "blue", textDecoration:'underline'}}>{expression.name}</a>
    } else if (expression.type === AttrNodeTypes.group) {
        const needParams = expression.op === OperatorNames['||'] && mayNeedParams
        return expression.op === OperatorNames['!'] ?
            (
                <>
                    !
                    {renderAttrExpression(createElement, expression.left, true)}
                </>
            ) : (
                 <>
                     {needParams ? '(' : null}
                     {renderAttrExpression(createElement,expression.left, expression.op === '&&')}
                     {expression.op}
                     {renderAttrExpression(createElement, expression.right!, expression.op === '&&')}
                     {needParams ? ')' : null}
                 </>
            )
    } else {
        debugger
        throw new Error('unknown type')
    }
}

function renderEditingInput(createElement, attrNode: AttrNode, onFocusout) {
    const lastConsecutiveInputEvent = atom(null)

    // 什么时候收起 dropdown ?

    const renderDraftControl = createDraftControl(Contenteditable, {
        pushEvent: 'container:onFocusout',
        // FIXME 还是想改成数组
        toControlValue: (rawValue) =>  <div className="px-4 border-b-2 border-indigo-500" style={{minWidth:20}} $editingInput>{renderAttrExpression(createElement, rawValue)}</div>,
        // FIXME 没有 parse 成功怎么办？？？parse 不成功和 parse成功后验证不通过是两个概念，要分分开处理。
        toDraft: (controlValue) => (parse(controlValue.innerText))
    })


    const dropdown = () => {
        console.log(lastConsecutiveInputEvent())
        if(!lastConsecutiveInputEvent()?.detail.data) return null

        const selection = window.getSelection()
        const range = selection.getRangeAt(0)
        // TODO 这里的 rect 的其实是在 consectuiveInput 完全改变后才能得到的，现在是因为触发 eventChange 的地方做了 setTimeout，但这不优雅
        const rect = range.getBoundingClientRect()
        console.log(range.getBoundingClientRect())

        return <div className="absolute" style={{background:'#fff', top: rect.top + rect.height, left: rect.left}}>
            dropdown
        </div>
    }

    // TODO 鼠标和键盘事件选择 option
    // TODO consecutive 也可以用 状态的方式实现，为什么这里要用事件？？？
    return <div className="relative" onFocusout={onFocusout}>
        {renderDraftControl(attrNode, {onConsecutiveInput:lastConsecutiveInputEvent})}
        {dropdown}
    </div>
}


/* @jsx createElement */
export function AttributiveInput({ value }: Props, { createElement, ref }: InjectHandles) {
    const editing = atom(false)

    const onFocusout = () => {
        editing(false)
    }

    // TODO onDblclick 要改成数组形式，变成一种关于状态事件和副作用的声明？
    const onDblclick = () => {
        // TODO editing 也要改成事件形式？
        editing(true)
        // TODO focus 要从 api 改成状态控制？
        // user.focusElement = xxxElement
        nextJob(() => {
            ref.editingInput!.focus()
        })
    }


    return <div className="inline-block mr-4" onDblclick={onDblclick} >
        {() => editing() ? renderEditingInput(createElement, value, onFocusout) : renderAttrExpression(createElement, value(), false, 'empty')}
    </div>
}
