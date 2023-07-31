import {AttrNode, AttrNodeTypes, OperatorNames, parse} from "./attrParser";
import {atom, computed, reactive} from "rata";
import {nextJob} from "../../src/util";
import {InjectHandles, Props} from "../../global";
import {createDraftControl} from "../createDraftControl";
import {Contenteditable} from "../contenteditable/Contenteditable";
import {Dropdown} from "../form/Dropdown";
import {configure} from "../../src/ComponentHost";
import {createEventTransfer, onDownKey, onEnterKey, onUpKey} from "../../eventAlias";

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


function AttrEditor({ value, onFocusout, errors, options}, { createElement} ) {
    const lastConsecutiveInputValue = atom('')

    const renderDraftControl = createDraftControl(Contenteditable, {
        pushEvent: 'container:onFocusout',
        // FIXME 还是想改成数组
        toControlValue: (rawValue) =>  <div className="px-4" $editingInput style={{minWidth:20, minHeight:20}} >{renderAttrExpression(createElement, rawValue)}</div>,
        toDraft: (controlValue) => (parse(controlValue.innerText)),
        errors
    })


    const insertAutoComplete = () => {
        console.log("should insert !!!")
    }

    const upKeyEventTransfer = createEventTransfer()
    const downKeyEventTransfer = createEventTransfer()
    const enterKeyEventTransfer = createEventTransfer()


    // const matchedOptions = options.filter(o => o.name.slice(0, data.length) === data )
    const matchedOptions = reactive([{name: '1'}, {name: '2'}, {name: '3'}])
    const dropdownStyle = () => {
        console.log('recompute style',lastConsecutiveInputValue())
        if (!lastConsecutiveInputValue()) return {display: 'none'}

        console.log('have new style')
        const selection = window.getSelection()
        const range = selection.getRangeAt(0)
        // TODO 这里的 rect 的其实是在 consectuiveInput 完全改变后才能得到的，现在是因为触发 eventChange 的地方做了 setTimeout，但这不优雅
        const rect = range.getBoundingClientRect()
        return {display: 'block', background:'#fff', zIndex: 9999, top: rect.top + rect.height, left: rect.left, minWidth: 20, minHeight: 20}
    }
    const dropdownIndex = atom(0)

    const preventArrowKey = (e) => e.preventDefault()


    return <div className="relative" onFocusout={onFocusout}>
        {renderDraftControl({
            value,
            lastConsecutiveInputValue,
            onKeydown:[
                onUpKey(upKeyEventTransfer.source),
                onDownKey(downKeyEventTransfer.source),
                onEnterKey(enterKeyEventTransfer.source),
                onUpKey(preventArrowKey), // 因为 keyup 会让 contenteditable 光标往前
                onEnterKey(preventArrowKey) // 不需要回车
            ]
        })}
        <Dropdown index={dropdownIndex} options={matchedOptions}>
            {configure({
                container: {
                    props: {
                        style: dropdownStyle,
                        className: "absolute border-2 border-indigo-500",
                        onKeydown: onEnterKey(insertAutoComplete)
                    },
                    eventTarget: [
                        upKeyEventTransfer.target,
                        downKeyEventTransfer.target,
                        enterKeyEventTransfer.target,
                    ]
                }
            })}
        </Dropdown>
    </div>
}


/* @jsx createElement */
export function AttributiveInput({ value, options = [] }: Props, { createElement, ref }: InjectHandles) {
    const editing = atom(false)
    const errors = reactive([])

    const onFocusout = () => {
        if (!errors.length) {
            editing(false)
        }
    }

    // 把各种不同的功能分开
    const onDblclick = [
        // TODO 状态修改也改成事件形式？例如 editing.setTrue ?? 还是 events.setEditing(() => editing(true))?
        () => editing(true),
        () => nextJob(() => {
            // TODO focus 要从 api 改成状态控制？
            // user.focusElement = xxxElement
            ref.editor!.ref!.editingInput!.focus!()
        })
    ]

    return <div className="inline-block mr-4" onDblclick={onDblclick} >
        {() => {
            console.warn('editing recompute')
            return editing() ? <AttrEditor ref='editor' value={value} onFocusout={onFocusout} errors={errors} options={options} /> : renderAttrExpression(createElement, value(), false, 'empty')
        }}
    </div>
}
