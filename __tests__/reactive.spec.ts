
import {Atom, atom} from "../src/atom";
import {reactive} from "../src/reactive";
import { describe, test, expect } from "@jest/globals";

describe('atom basic', () => {

    test('initialize & update atom', () => {
        const num = atom(1)
        num(2)
        expect(num).toShallowEqual(2)
        expect(num()).toBe(2)

        expect(typeof num).toBe('function')

        num(3)
        expect(num).toShallowEqual(3)
    })
})


describe('reactive basic', () => {
    test('initialize & update leaf', () => {
        const obj = reactive({leaf:1})

        expect(obj.leaf).toShallowEqual(1)
        // @ts-ignore
        expect(obj.leaf === 1).toBe(false)

        expect(typeof obj.leaf).toBe('function')

        const leaf: Atom = obj.leaf
        leaf(3)
        expect(obj.leaf).toShallowEqual(3)
    })
})

describe('number/string atom with primitive operations', () => {
    test('with number operator', () => {
        const num = atom(1)
        expect(num + 2).toBe(3)

        num(5)
        expect(num - 3).toBe(2)
    })

    test('with string', () => {
        const num = atom(1)
        expect(`${num}` ).toBe('1')
        expect(num + '1').toBe('11')
    })

    test('string atom', () => {
        const num = atom('a')
        expect(num).toShallowEqual('a')

        expect(`${num}b`).toBe('ab')
        expect(num + 'b').toBe('ab')
    })
})


describe('array reactive', () => {
    test('array reactive basic', () => {
        const arr = reactive([1,2,3])
        arr.splice(1,1)
    })
})