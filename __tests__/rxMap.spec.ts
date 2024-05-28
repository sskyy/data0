import {describe, expect, test} from "vitest";
import {RxMap} from "../src/RxMap.js";
import {RxList, setDefaultScheduleRecomputedAsLazy} from "../src/index.js";

setDefaultScheduleRecomputedAsLazy(true)


describe('RxMap', () => {
    test('get entries', () => {
        const map = new RxMap<string, number>({a: 1, b: 2, c: 3})

        expect(map.entries().toArray()).toMatchObject([['a', 1], ['b', 2], ['c', 3]])

        map.set('d', 4)
        expect(map.entries().toArray()).toMatchObject([['a', 1], ['b', 2], ['c', 3], ['d', 4]])

        map.delete('a')
        expect(map.entries().toArray()).toMatchObject([['b', 2], ['c', 3], ['d', 4]])

        map.clear()
        expect(map.entries().toArray()).toMatchObject([])
    })

    // keys
    test('get keys', () => {
        const map = new RxMap<string, number>({a: 1, b: 2, c: 3})
        const keys = map.keys()

        expect(keys.toArray()).toMatchObject(['a', 'b', 'c'])

        map.set('d', 4)
        expect(keys.toArray()).toMatchObject(['a', 'b', 'c', 'd'])

        map.delete('a')
        expect(keys.toArray()).toMatchObject(['b', 'c', 'd'])

        map.clear()
        expect(keys.toArray()).toMatchObject([])
    })

    // values
    test('get values', () => {
        const map = new RxMap<string, number>({a: 1, b: 2, c: 3})
        const values = map.values()

        expect(values.toArray()).toMatchObject([1, 2, 3])

        map.set('d', 4)
        expect(values.toArray()).toMatchObject([1, 2, 3, 4])

        map.delete('a')
        expect(values.toArray()).toMatchObject([2, 3, 4])

        map.clear()
        expect(values.toArray()).toMatchObject([])
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

        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, false])

        selectedEdges.push(rawEdges[1])
        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, true])

        // 新增一个 edge，然后再选中
        const newEdge = {id: 3, from: '1', to: '2'}
        rawEdgesById.set('3', newEdge)
        expect(valuesList.toArray()).toMatchObject([rawEdges[0], rawEdges[1], newEdge])
        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, true, false])

        //
        selectedEdges.push(newEdge)
        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, true, true])
    })

})