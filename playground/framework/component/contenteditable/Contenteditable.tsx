// 这里的 contenteditable 组件和 richtext 不是同一个东西。
// richText 的 value 是有业务语义的数据结构，这里的 value 就是 element children

import {nextJob} from "../../src/util";

function getSelectionRange() {
    const selection = window.getSelection()
    if (!selection.rangeCount) return null
    return selection.getRangeAt(0)
}

function hasCursor() {
    const selection = window.getSelection()
    return selection.rangeCount !== 0
}



export function Contenteditable({ value,  ...props }, {createElement, ref}) {

    let consecutiveInputValue = ''

    const triggerConsecutiveInput = (data) => {
        const range = getSelectionRange()
        consecutiveInputValue = range?.collapsed ? (consecutiveInputValue + data):data
        // TODO 为了让外界获得准确的 range boundingClientRect
        setTimeout(() => {
            const newEvent = new CustomEvent('consecutiveinput',  { detail: {data: consecutiveInputValue}, cancelable: true });
            ref.container.dispatchEvent(newEvent)
        }, 1)
    }

    const handleKeydown = (e) => {
        if (!hasCursor()) {
            return
        }
        // TODO 判断有没有 cursor
        // -2 输入法中的  Keydown 不管。
        // 这里有关于 keydown 和输入法的问题的例子。虽然 keydown 发生在 compositionstart 前，但 keyCode === 229 能表示这个  keydown 是输入法的一部分。
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event
        if (e.isComposing || e.keyCode === 229) {
            return;
        }

        if(e.key.length === 1) {
            triggerConsecutiveInput(e.key)
        }
    }

    const handlePaste = (e) => {
        // TODO
        // const domparser = new DOMParser()
        // const result = domparser.parseFromString(e.clipboardData!.getData('text/html'), 'text/html')
        // const range = getSelectionRange()
        // consecutiveInputValue = range ? e.key : (consecutiveInputValue + e.key)
        //
    }

    const handleCompositionend = (e) => {
        triggerConsecutiveInput(e.data)
    }

    const handleBlur = () => {
        consecutiveInputValue = ''
        triggerConsecutiveInput('')
    }

    // TODO selection change 也要监听，但监听的是 document 上面的，还需要消除。
    const handleSelectionChange = () => {
        // 这里得判断到底是用户鼠标键盘移动导致的，还是 输入导致的。
        console.log(getSelectionRange())
    }
    document.addEventListener('selectionchange', handleSelectionChange)

    return <div $container {...props}>
        {() => {
            const inner = value() as HTMLElement
            inner.addEventListener('keydown', handleKeydown)
            inner.addEventListener('paste', handlePaste)
            inner.addEventListener('blur', handleBlur)
            inner.addEventListener('compositionend', handleCompositionend)
            inner.setAttribute('contenteditable', 'true')

            return inner
        }}
    </div>
}
