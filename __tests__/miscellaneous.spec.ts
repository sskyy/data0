import {computed, atom, reactive} from "../src";
import { describe, test, expect } from "@jest/globals";

describe('computed on computed', () => {
    test('atom & computed', () => {
        const atom1 = atom(null)
        const computed1 = computed(() => {
            return atom1()?.items || []
        })

        // splice 不触发 forEach 为什么？？？
        const computed2 = computed(() => {
            const result = new Map<string, any>()
            computed1.forEach((item: number) => {
                result.set(item.toString(), item)
            })
            return result
        })

        atom1({items: [1,2,3]})

        expect(computed1).toShallowMatchObject([1,2,3])

        expect(computed2.get('1')).toBe(1)
        expect(computed2.get('2')).toBe(2)
        expect(computed2.get('3')).toBe(3)

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
        expect(computed1.get('1')).toBe(1)

    })

})