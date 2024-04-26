import {describe, expect, test} from "vitest";
import {RxMap} from "../src/RxMap.js";
import {RxList} from "../src/index.js";

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

    test('chained computed', () => {
        const rawEdges = [
            {id: 1, from: '1', to: '2'},
            {id: 2, from: '1', to: '2'},
        ]

        const rawEdgesById = new RxMap<string, any>(
            rawEdges.map(edge => [edge.id, edge]))

        const valuesList = rawEdgesById.values()

        const selectedEdges = new RxList<any>([rawEdges[0]])
        const valueWithSelected = valuesList.createSelection(selectedEdges)

        const selectedValues = valueWithSelected.map(([_, selected]) => selected)

        expect(selectedValues.data.map(v => v())).toMatchObject([true, false])

        selectedEdges.push(rawEdges[1])
        expect(selectedValues.data.map(v => v())).toMatchObject([true, true])

        // 新增一个 edge，然后再选中
        const newEdge = {id: 3, from: '1', to: '2'}
        rawEdgesById.set('3', newEdge)
        expect(valuesList.data).toMatchObject([rawEdges[0], rawEdges[1], newEdge])
        expect(selectedValues.data.map(v => v())).toMatchObject([true, true, false])

        //
        selectedEdges.push(newEdge)
        expect(selectedValues.data.map(v => v())).toMatchObject([true, true, true])
    })

})