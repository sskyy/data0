/* @jsx createElement */
// import { createRoot, createElement, incMap, reactive } from "axii";
import { createElement } from "axii";
import {computed, incMap, reactive} from "../../src/index.js";
// import {incMap, reactive} from "../../src/index.js";
import { computed as vComputed, reactive as vReactive} from "vue";


export function App() {
    const LENGTH = 50000

    const x1 = vReactive(Array(LENGTH).fill({value:0}))
    const c1 = vComputed(() => {
        return x1.map(item => ({value: item.value+1}))
    })

    const x2 = reactive(Array(LENGTH).fill({value:0}))
    const c2 = computed(() => {
        return x2.map(item => ({value: item.value+1}))
    })

    const x3 = reactive(Array(LENGTH).fill({value:0}))
    const c3 = incMap(x3, item => ({value: item.value+1}))

    const pushVue = () => {
        x1.push({value: 0});
        c1.value
    }

    const pushX2 = () => {
        x2.push({value: 0});
    }

    const pushX3 = () => {
        x3.push({value: 0});
    }

    const unshiftVue = () => {
        x1.unshift({value: 0});
        c1.value
    }

    const unshiftX2 = () => {
        x2.unshift({value: 0});
        console.log(c2.length)
    }

    const unshiftX3 = () => {
        x3.unshift({value: 0})
    }

    return <div>
        <div>hello world</div>
        <button onClick={pushVue}>run vue push</button>
        <button onClick={pushX2}>run data0 push</button>
        <button onClick={pushX3}>run data0 push inc</button>

        <div>
            <button onClick={unshiftVue}>run vue unshift</button>
            <button onClick={unshiftX2}>run data0 unshift</button>
            <button onClick={unshiftX3}>run data0 unshift inc</button>
        </div>
    </div>
}