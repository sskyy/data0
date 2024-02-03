import {describe, expect, test} from "vitest";
import {RxMap} from "../src/RxMap.js";

describe('RxMap', () => {
    test('get entries', () => {
        const map = new RxMap<string, number>({a: 1, b: 2, c: 3})
        const entries = map.entries()

        expect(entries.data).toMatchObject([['a', 1], ['b', 2], ['c', 3]])

        map.set('d', 4)
        expect(entries.data).toMatchObject([['a', 1], ['b', 2], ['c', 3], ['d', 4]])

        map.delete('a')
        expect(entries.data).toMatchObject([['b', 2], ['c', 3], ['d', 4]])

        map.clear()
        expect(entries.data).toMatchObject([])
    })

    // keys
    test('get keys', () => {
        const map = new RxMap<string, number>({a: 1, b: 2, c: 3})
        const keys = map.keys()

        expect(keys.data).toMatchObject(['a', 'b', 'c'])

        map.set('d', 4)
        expect(keys.data).toMatchObject(['a', 'b', 'c', 'd'])

        map.delete('a')
        expect(keys.data).toMatchObject(['b', 'c', 'd'])

        map.clear()
        expect(keys.data).toMatchObject([])
    })

    // values
    test('get values', () => {
        const map = new RxMap<string, number>({a: 1, b: 2, c: 3})
        const values = map.values()

        expect(values.data).toMatchObject([1, 2, 3])

        map.set('d', 4)
        expect(values.data).toMatchObject([1, 2, 3, 4])

        map.delete('a')
        expect(values.data).toMatchObject([2, 3, 4])

        map.clear()
        expect(values.data).toMatchObject([])
    })



})