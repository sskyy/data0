export function eventAlias(match) {
    return (handle) => {
        return (e) => {
            if (match(e)) {
                handle(e)
            }
        }
    }
}

export const onUpKey = eventAlias((e) => e.key === 'ArrowUp')
export const onDownKey = eventAlias((e) => e.key === 'ArrowDown')
export const onLeftKey = eventAlias((e) => e.key === 'ArrowLeft')
export const onRightKey = eventAlias((e) => e.key === 'ArrowRight')
export const onEnterKey = eventAlias((e) => e.key === 'Enter')
export const onTabKey = eventAlias((e) => e.key === 'Tab')
export const onESCKey = eventAlias((e) => e.key === 'Escape')

export const onSelf = eventAlias(e => e.target === e.currentTarget)


export function createEventTransfer() {
    let triggerTargetEvent
    function target(trigger) {
        if (triggerTargetEvent) {
            debugger
            throw new Error('event transfer can only have one target')
        }
        triggerTargetEvent = trigger
    }

    function source(e) {
        if (triggerTargetEvent) {
            triggerTargetEvent(e)
        } else {
            console.warn('target is not ready')
        }
    }

    return {
        source,
        target
    }
}

