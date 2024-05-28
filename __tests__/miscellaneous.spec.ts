import {atom, computed, incUnique, reactive, setDefaultScheduleRecomputedAsLazy} from "../src";
import {describe, expect, test} from "vitest";

setDefaultScheduleRecomputedAsLazy(true)


describe('computed on computed', () => {
    test('atom & computed', () => {
        const atom1 = atom<{items: any[]}>(null)
        const computed1 = computed(function computed1()  {
            return atom1()?.items || []
        })

        // splice 不触发 forEach 为什么？？？
        const computed2 = computed(function computed2() {
            const result = new Map<string, any>()
            computed1.forEach((item: number) => {
                result.set(item.toString(), item)
            })
            return result
        })

        atom1({items: [1,2,3]})

        expect(computed1).toShallowMatchObject([1,2,3])

        expect(computed2.get('1')).toShallowEqual(1)
        expect(computed2.get('2')).toShallowEqual(2)
        expect(computed2.get('3')).toShallowEqual(3)

    })

    test('splice should trigger foreach', () => {

        const arr1: number[] = reactive([])
        const computed1 = computed(() => {
            const result = new Map<string, any>()
            arr1.forEach((item: number) => {
                result.set(item.toString(), item)
            })
            return result
        })

        arr1.splice(0, 0, 1,2,3)
        expect(computed1.get('1')).toShallowEqual(1)

    })

    test('incUnique should recompute', () => {
        const origin: any[] = [1,2, 2]
        const atom1 = atom(null)
        const source = reactive(origin.concat(atom1))
        const uniqueSet = incUnique(source)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2, undefined])

        atom1(3)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2, 3])
        atom1(4)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2,4])
        atom1(1)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2])
    })

})