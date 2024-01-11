import { bench, describe } from 'vitest'
import { computed as vComputed, reactive as vReactive} from "vue";
import { computed } from "../src/computed";
import { reactive } from "../src/reactive";
import { incMap } from "../src/incremental.js";



describe('map', () => {
    const LENGTH = 100000
    const x1 = vReactive(Array(LENGTH).fill({value:0}))
    const c1 = vComputed(() => {
        return x1.map(item => ({value: item.value+1}))
    })

    const x2 = reactive(Array(LENGTH).fill({value:0}))
     computed(() => {
        return x1.map(item => ({value: item.value+1}))
    })

    const x3 = reactive(Array(LENGTH).fill({value:0}))
    incMap(x3, item => ({value: item.value+1}))


    bench('vue', () => {
        x1.unshift({value:1})
        // trigger recompute
        c1.value
    })

    bench('data0', () => {
        x2.unshift({value:0})
    })

    bench('data0 incMap', () => {
        x3.unshift({value:0})
    })


})