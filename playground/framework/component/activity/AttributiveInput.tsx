import {createElement, Fragment} from "@framework";
import {AttrNode, AttrNodeTypes, OperatorNames, parse} from "./attrParser";
import {atom} from "rata";

console.log(parse('A && !B || C || D && (E || !F)'))


function renderAttrExpression(expression?: AttrNode, mayNeedParams?: boolean) {
    if (!expression) return <div>empty</div>

    if ( expression.type === AttrNodeTypes.variable) {
        return <a href="#" style={{color: "blue", textDecoration:'underline'}}>{expression.name}</a>
    } else if (expression.type === AttrNodeTypes.group) {
        const needParams = expression.op === OperatorNames['||'] && mayNeedParams
        return expression.op === OperatorNames['!'] ?
            (
                <>
                    !
                    {renderAttrExpression(expression.left, true)}
                </>
            ) : (
                 <>
                     {needParams ? '(' : null}
                     {renderAttrExpression(expression.left, expression.op === '&&')}
                     {expression.op}
                     {renderAttrExpression(expression.right!, expression.op === '&&')}
                     {needParams ? ')' : null}
                 </>
            )
    } else {
        debugger
        throw new Error('unknown type')
    }
}

function renderEditingInput(attrNode: AttrNode, onConfirm) {
    return <div contenteditable onBlur={(e) => onConfirm(e.target.innerText)} style={{minWidth:20}}>
        {attrNode ? renderAttrExpression(attrNode) : ''}
    </div>
}



export function AttributiveInput({ value }) {
    const editing = atom(false)

    const onConfirm = (innerText) => {
        const newAttr = parse(innerText)
        value(newAttr)
        editing(false)
    }

    // TODO focus ?
    // user.focusElement = xxxElement

    return <div className="inline-block mr-4" ondblclick={() => editing(true)} >
        {() => editing() ? renderEditingInput(value(), onConfirm) : renderAttrExpression(value())}
    </div>
}
