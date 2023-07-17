
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

describe('reactive leaf', () => {
    test('return leaf atom if leaf is primitive', () => {
        const arr = reactive([1, '2'])
        expect(typeof arr[0]).toBe('function')
        expect((arr[0] as Atom<number>)()).toBe(1)
        expect(typeof arr[1]).toBe('function')
        expect((arr[1] as Atom<string>)()).toBe('2');

        (arr[0] as Atom<number>)(2);
        (arr[1] as Atom<string>)('3')
        expect(typeof arr[0]).toBe('function')
        expect((arr[0] as Atom<number>)()).toBe(2)
        expect(typeof arr[1]).toBe('function')
        expect((arr[1] as Atom<string>)()).toBe('3')
    })

    test('return origin object if leaf is not plainObject', () => {
        class Test{}
        const a = new Test()
        const arr = reactive([1, a])
        expect(typeof arr[0]).toBe('function')
        expect((arr[0] as Atom<number>)()).toBe(1)

        expect( arr[1] instanceof Test).toBe(true)
        expect( typeof arr[1] ).toBe('object')
        expect( arr[1].constructor ).toBe(Test)
    })

    test('Map primitive leaf should be atom too', () => {
        const map = new Map()
        map.set('a', 1)
        map.set('b', '2')
        const rMap = reactive(map)
        expect(typeof rMap.get('a')).toBe('function')
        expect((rMap.get('a') as Atom<number>)()).toBe(1)
        expect(typeof rMap.get('b')).toBe('function')
        expect((rMap.get('b') as Atom<string>)()).toBe('2');
    })

    test('Map primitive leaf should be atom too', () => {
        class Test{}
        const a = new Test()
        const map = new Map()
        map.set('a', a)
        map.set('b', '2')
        const rMap = reactive(map)
        expect(typeof rMap.get('a')).toBe('object')
        expect(rMap.get('a').constructor).toBe(Test)
        expect(typeof rMap.get('b')).toBe('function')
        expect((rMap.get('b') as Atom<string>)()).toBe('2');
    })

})