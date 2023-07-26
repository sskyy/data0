import {createElement, propTypes} from "@framework";
import {ArrowIcon} from "../icons/arrow";
import {atom, reactive} from "rata";
import {CheckIcon} from "../icons/check";

export function Select({ options, selected }) {
    return (
        <div>
            <label id="listbox-label" className="block text-sm font-medium leading-6 text-gray-900">Assigned to</label>
            <div className="relative mt-2">
                <button type="button"
                        className="relative w-full cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                        aria-haspopup="listbox" aria-expanded="true" aria-labelledby="listbox-label">
                    <span className="block truncate">Tom Cook</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        {ArrowIcon}
                    </span>
                </button>
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    tabIndex="-1" role="listbox" aria-labelledby="listbox-label"
                    aria-activedescendant="listbox-option-3">
                    <li className="text-gray-900 relative cursor-default select-none py-2 pl-3 pr-9"
                        id="listbox-option-0" role="option">
                        <span className="font-normal block truncate">Wade Cooper</span>
                        <span className="text-indigo-600 absolute inset-y-0 right-0 flex items-center pr-4">
                            {CheckIcon}
                        </span>
                    </li>
                </ul>
            </div>
        </div>
    )
}

Select.propTypes = {
    options: propTypes.array.default(() => reactive([])),
    selected: propTypes.any.default(() => atom(null))
}
