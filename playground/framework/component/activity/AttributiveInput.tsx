import {createElement, Fragment} from "@framework";
import {AttrNode, AttrNodeTypes, OperatorNames, parse} from "./attrParser";
import {atom} from "rata";

console.log(parse('A && !B || C || D && (E || !F)'))


function renderAttrExpression(expression: AttrNode, mayNeedParams?: boolean) {
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
    return <div contenteditable onBlur={(e) => onConfirm(e.target.innerText)}>
        {renderAttrExpression(attrNode)}
    </div>
}



export function AttributiveInput({ options, attributive = atom(parse('A && !B || C || D && (E || !F)'))}) {
    const editing = atom(false)

    const onConfirm = (innerText) => {
        const newAttr = parse(innerText)
        attributive(newAttr)
        editing(false)
    }
    return <div className="inline-block mr-4" ondblclick={() => editing(true)} >
        {() => editing() ? renderEditingInput(attributive(), onConfirm) : renderAttrExpression(attributive())}
    </div>
}


export function AttributiveInput2({ value, isEditing, errors, push}) {
    // editing value 好像根本没有必要 外部生成，因为是和组件嘻嘻相关的。
    //  这里甚至都不需要，因为我们的编辑工具不需要受控。

    const onConfirm = (innerText) => {
        const newAttr = parse(innerText)
        push(newAttr)
        isEditing(false)
    }

    return <div className="inline-block mr-4" ondblclick={() => isEditing(true)} >
        {() => isEditing() ? renderEditingInput(value, onConfirm) : renderAttrExpression(value)}
    </div>
}
