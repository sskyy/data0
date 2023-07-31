import {onUpKey, onDownKey} from "../../eventAlias";
import {Atom, incMap} from "rata";

export function Dropdown({ index, options}, { createElement, ref }) {
    const setNextIndex = () => {
        if (index() < options.length -1) index(index()+1)
    }

    const setPrevIndex = () => {
        if (index() > 0) index(index() - 1)
    }


    return <div ref='container' onKeydown={[onUpKey(setPrevIndex), onDownKey(setNextIndex)]} >
        {incMap(options, (option, i) => {
            const className = () => {
                const isCurrent = (i as Atom<boolean>)() === index()
                return {
                    'bg-indigo-500': isCurrent,
                    'text-white': isCurrent,
                    'cursor-pointer' : true,
                    'hover:bg-indigo-100': !isCurrent
                }
            }

            return (
                <div className={className}>
                    {option.name}
                </div>
            )
        })}
    </div>
}