/* @jsx createElement */
// import { createRoot, createElement, incMap, reactive } from "axii";
import { createElement } from "axii";
import {incMap, reactive} from "../../src/index.js";
// import {incMap, reactive} from "../../src/index.js";
import { computed as vComputed, reactive as vReactive} from "vue";


export function App() {

    const x1 = vReactive(Array(10000).fill({value:0}))
    const c1 = vComputed(() => {
        return x1.map(item => ({value: item.value+1}))
    })

    const x3 = reactive(Array(10000).fill({value:0}))
    const c3 = incMap(x3, item => ({value: item.value+1}))

    return <div>
        <div>hello world</div>
        <button onClick={() => x3.push({value:0})}>run data0 push</button>
        <button onClick={() => x1.push({value:0})}>run vue push</button>
    </div>
}