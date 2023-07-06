import {computed} from "../src/computed";
import {atom} from "../src/atom";
import {reactive} from "../src/reactive";
import { describe, test, expect } from "@jest/globals";

describe('computed basic', () => {
    test('atom & computed', () => {
        const num1 = atom(1)
        const num2 = atom(2)
        const num3 = computed(() => num1 + num2)

        expect(num3).toShallowEqual(3)

        num1(3)
        expect(num3).toShallowEqual(5)

        num2(4)
        expect(num3).toShallowEqual(7)

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

        const num = computed(() => {
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