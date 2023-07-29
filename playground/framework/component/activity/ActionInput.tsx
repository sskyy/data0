import {createElement} from '@framework'


export function ActionInput({ value }) {
    return <input placeholder="action name" value={value} onChange={(e)=> value(e.target.value)}/>
}