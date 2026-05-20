import {arrayComputed, Computed, computed, destroyComputed, objectComputed, scheduleNextMicroTask} from "../src/computed";
import {atom} from "../src/atom";
import {reactive} from "../src/reactive";
import {beforeEach, describe, expect, test} from "vitest";
import {autorun, batch, ReactiveEffect} from "../src";


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
    test('reactive effect creates low-frequency collections lazily', () => {
        const effect = new ReactiveEffect(() => undefined)

        expect((effect as any)._eventToCallbacks).toBeUndefined()
        expect((effect as any)._asyncTracks).toBeUndefined()
        expect((effect as any)._children).toBeUndefined()

        effect.dispatch('destroy')
        expect((effect as any)._eventToCallbacks).toBeUndefined()

        expect(effect.hasChildren()).toBe(false)
        expect((effect as any)._children).toBeUndefined()

        const child = new ReactiveEffect(() => undefined)
        expect(effect.addChild(child)).toBe(0)
        expect(effect.hasChildren()).toBe(true)
        expect((effect as any)._children).toHaveLength(1)

        effect.destroyChildren()
        expect(effect.hasChildren()).toBe(false)

        effect.queueAsyncTrack(() => undefined)
        expect((effect as any)._asyncTracks).toHaveLength(1)

        effect.on('destroy', () => undefined)
        expect((effect as any)._eventToCallbacks).toBeInstanceOf(Map)
    })

    test('reactive effect destroy event fires once from instance destroy', () => {
        const effect = new ReactiveEffect(() => undefined)
        let destroyCalls = 0
        effect.on('destroy', () => {
            destroyCalls++
        })

        effect.destroy()
        effect.destroy()

        expect(destroyCalls).toBe(1)
    })

    test('reactive effect destroy event fires once from static destroy', () => {
        const effect = new ReactiveEffect(() => undefined)
        let destroyCalls = 0
        effect.on('destroy', () => {
            destroyCalls++
        })

        ReactiveEffect.destroy(effect)
        ReactiveEffect.destroy(effect)

        expect(destroyCalls).toBe(1)
    })

    test('computed onDestroy callback fires once from instance destroy', () => {
        let destroyCalls = 0
        const item = new Computed(() => 1, undefined, true, {
            onDestroy() {
                destroyCalls++
            }
        })

        item.destroy()
        item.destroy()

        expect(destroyCalls).toBe(1)
    })

    test('computed onDestroy callback fires once from destroyComputed', () => {
        let destroyCalls = 0
        const item = computed(() => 1, undefined, true, {
            onDestroy() {
                destroyCalls++
            }
        })

        destroyComputed(item)
        destroyComputed(item)

        expect(destroyCalls).toBe(1)
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

describe('batch', () => {
    test('coalesces multiple atom updates into one recompute', () => {
        const num1 = atom(1)
        const num2 = atom(2)
        let computedRuns = 0

        const sum = computed(() => {
            computedRuns++
            return num1() + num2()
        })

        expect(sum()).toBe(3)
        expect(computedRuns).toBe(1)

        batch(() => {
            num1(2)
            num2(3)
        })

        expect(sum()).toBe(5)
        expect(computedRuns).toBe(2)
    })

    test('nested batches flush only at the outer boundary', () => {
        const num1 = atom(1)
        const num2 = atom(2)
        let computedRuns = 0

        const sum = computed(() => {
            computedRuns++
            return num1() + num2()
        })

        batch(() => {
            num1(2)
            batch(() => {
                num2(3)
            })
            expect(sum()).toBe(3)
            expect(computedRuns).toBe(1)
        })

        expect(sum()).toBe(5)
        expect(computedRuns).toBe(2)
    })

    test('flushes pending effects when callback throws', () => {
        const num = atom(1)
        let computedRuns = 0

        const doubled = computed(() => {
            computedRuns++
            return num() * 2
        })

        expect(() => {
            batch(() => {
                num(2)
                throw new Error('boom')
            })
        }).toThrow('boom')

        expect(doubled()).toBe(4)
        expect(computedRuns).toBe(2)
    })
})
