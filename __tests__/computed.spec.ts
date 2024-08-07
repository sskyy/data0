import {arrayComputed, computed, objectComputed, scheduleNextMicroTask} from "../src/computed";
import {atom} from "../src/atom";
import {reactive} from "../src/reactive";
import {beforeEach, describe, expect, test} from "vitest";
import {autorun} from "../src";


describe('computed basic', () => {
    beforeEach(() => {
    })

    test('atom & computed', () => {
        const num1 = atom(1)
        const num2 = atom(2)
        // @ts-ignore
        const num3 = computed(() => num1 + num2)

        expect(num3).toShallowEqual(3)

        num1(3)
        expect(num3).toShallowEqual(5)

        num2(4)
        expect(num3).toShallowEqual(7)

    })

    test('reactive & computed', () => {
        const x2 = reactive(Array(5).fill(0))
        const c2 = arrayComputed(() => {
            return x2.map(item => (item+1))
        })
        x2.unshift(1)
        expect(c2.length).toBe(6)
        expect(c2).toShallowMatchObject([2,1,1,1,1,1])
    })


    test('reactive leaf & computed', () => {
        const data = reactive({
            l1: 1,
            l2: 2
        })

        const data2 = reactive( {
            l1: 3,
            l2: 4
        })

        const num = computed(() => data.l1 + data.l2 + data2.l1 + data2.l2)
        expect(num).toShallowEqual(10)

        data.l1 = 5
        expect(num).toShallowEqual(14)

        data2.l2 = 5
        expect(num).toShallowEqual(15)

    })

    test('reactive leaf & object computed', () => {
        const data = reactive({
            l1: 1,
            l2: 2
        })

        const data2 = reactive( {
            l1: 3,
            l2: 4
        })

        const num = objectComputed<{result:any}>(() => {
            return {
                result: data.l1 + data.l2 + data2.l1 + data2.l2
            }
        })

        expect(num.result).toShallowEqual(10)

        data.l1 = 5

        expect(num.result).toShallowEqual(14)

        data2.l2 = 5
        expect(num.result).toShallowEqual(15)
    })
})

describe('computed life cycle', () => {
    beforeEach(() => {
    })
    test('should destroy inner computed', () => {
        let innerRuns = 0
        const a = atom(0)
        const b = atom(0)
        const stop = autorun(() => {
            a()
            autorun(() => {
                b()
                innerRuns ++
            },true)
        }, true)

        expect(innerRuns).toBe(1)
        b(1)
        expect(innerRuns).toBe(2)
        a(1)
        expect(innerRuns).toBe(3)
        b(2)
        // TODO 这里期待 computed 重新执行的时候，上一次内部的 computed 应该自动回收掉。
        expect(innerRuns).toBe(4)

        stop()
        b(2)
        // destroy 外面之后，里面的 computed 也要全部回收
        expect(innerRuns).toBe(4)

    })
})

describe('computed return object with internal side effect', () => {
    beforeEach(() => {
    })
    test('should call cleanup method', () => {
        let destroyCalled = 0
        class InternalWithSideEffect {
            destroy() {
                destroyCalled ++
            }
        }

        const run = atom(1)
        const stopAutorun = autorun(({ onCleanup }) => {
            run()
            const valueWithSideEffect = new InternalWithSideEffect()
            onCleanup(() => {
                valueWithSideEffect.destroy()
            })
            return valueWithSideEffect
        },true)

        expect(destroyCalled).toBe(0)
        run(2)
        expect(destroyCalled).toBe(1)

        stopAutorun()
        expect(destroyCalled).toBe(2)


    })
})


function wait(time: number) {
    return new Promise(resolve => {
        setTimeout(resolve, time)
    })
}

describe('computed with scheduler', () => {
    test('next micro task', async () => {
        const num1 = atom(1)
        const num2 = atom(2)
        let computedRuns = 0
        const num3 = computed<number|undefined>(() => {
            computedRuns ++
            return num1() + num2()
        }, undefined, scheduleNextMicroTask)

        expect(num3()).toBe(3)
        expect(computedRuns).toBe(1)

        num1(2)
        num2(3)
        expect(num3()).toBe(3)
        expect(computedRuns).toBe(1)

        await wait(1)
        expect(num3()).toBe(5)
        expect(computedRuns).toBe(2)
    })
})