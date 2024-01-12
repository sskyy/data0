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
    }

    const unshiftX3 = () => {
        x3.unshift({value: 0})
    }

    window.pushVue1 = pushVue
    window.pushX21 = pushX2
    window.pushX31 = pushX3
    window.unshiftVue1 = unshiftVue
    window.unshiftX21 = unshiftX2
    window.unshiftX31 = unshiftX3


    return <div>
        <div>hello world</div>
        <button data-testid="push-vue" onClick={pushVue}>run vue push</button>
        <button data-testid="push-x2" onClick={pushX2}>run data0 push</button>
        <button data-testid="push-x3" onClick={pushX3}>run data0 push inc</button>

        <div>
            <button data-testid="unshift-vue" onClick={unshiftVue}>run vue unshift</button>
            <button data-testid="unshift-x2" onClick={unshiftX2}>run data0 unshift</button>
            <button data-testid="unshift-x3" onClick={unshiftX3}>run data0 unshift inc</button>
        </div>
    </div>
}