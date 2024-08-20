import {bench, describe} from 'vitest'
import {computed as vComputed, reactive as vReactive} from "vue";
import {RxList} from "../src/index";


describe('map and push', () => {
    const LENGTH = 100000
    const x1 = vReactive(Array(LENGTH).fill({value:0}))
    const c1 = vComputed(() => {
        return x1.map((item:any) => ({value: item.value+1}))
    })


    const x3 = new RxList(Array(LENGTH).fill({value:0}))
    x3.map(item => ({value: item.value+1}))


    bench('vue', () => {
        x1.push({value:1})
        // trigger recompute
        c1.value
    })


    bench('data0 RxList Map', () => {
        x3.push({value:0})
    })
})

describe('map and unshift', () => {
    const LENGTH = 1000
    const x1 = vReactive(Array(LENGTH).fill({value:0}))
    const c1 = vComputed(() => {
        return x1.map((item:any) => ({value: item.value+1}))
    })

    const x3 = new RxList(Array(LENGTH).fill({value:0}))
    x3.map(item => ({value: item.value+1}))


    bench('vue', () => {
        x1.unshift({value:1})
        // trigger recompute
        c1.value
    })

    bench('data0 incMap', () => {
        x3.unshift({value:0})
    })
})