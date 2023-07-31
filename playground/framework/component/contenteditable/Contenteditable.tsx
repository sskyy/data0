// 这里的 contenteditable 组件和 richText 不是同一个东西。
// richText 的 value 是有业务语义的数据结构，这里的 value 就是 element children


import {atom, computed} from "rata";

function getSelectionRange() {
    const selection = window.getSelection()
    if (!selection.rangeCount) return null
    return selection.getRangeAt(0)
}

function hasCursor() {
    const selection = window.getSelection()
    return selection.rangeCount !== 0
}



export function Contenteditable({ value, errors, lastConsecutiveInputValue = atom(''), ...props }, {createElement, ref}) {


    const updateConsecutiveInput = (data) => {
        const range = getSelectionRange()
        // TODO 为了让外界获得准确的 range boundingClientRect
        setTimeout(() => {
            lastConsecutiveInputValue(
                data === undefined ?
                    '' :
                    (range?.collapsed ?
                        (lastConsecutiveInputValue() + data)
                        :data
                    )
            )
        }, 1)
    }

    const handleKeydown = (e) => {
        if (!hasCursor()) {
            return
        }
        // -2 输入法中的  Keydown 不管。
        // 这里有关于 keydown 和输入法的问题的例子。虽然 keydown 发生在 compositionstart 前，但 keyCode === 229 能表示这个  keydown 是输入法的一部分。
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event
        if (e.isComposing || e.keyCode === 229) {
            return;
        }

        if(e.key.length === 1) {
            updateConsecutiveInput(e.key)
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
        updateConsecutiveInput(e.data)
    }

    const handleBlur = () => {
        updateConsecutiveInput(undefined)
    }

    // TODO selection change 也要监听，但监听的是 document 上面的，还需要消除。
    const handleSelectionChange = () => {
        // 这里得判断到底是用户鼠标键盘移动导致的，还是 输入导致的。
        // console.log(getSelectionRange())
    }
    document.addEventListener('selectionchange', handleSelectionChange)

    const className = computed(() => {
        return errors.length ? 'border-b-2 border-rose-500' :'border-b-2 border-indigo-500'
    })

    return <div ref="container" {...props} className={className} >
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
