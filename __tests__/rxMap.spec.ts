import {describe, expect, test} from "vitest";
import {RxMap} from "../src/RxMap.js";
import {RxSet} from "../src/RxSet";
import {computed, RxList} from "../src";


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

    test('get values of lazy RxMap', () => {
        const map = new RxMap({})
        const values = map.values()
        map.set('d', 4)
        expect(values.toArray()).toMatchObject([4])
    })

    test('chained computed', () => {
        const rawEdges = [
            {id: 1, from: '1', to: '2'},
            {id: 2, from: '1', to: '2'},
        ]

        const rawEdgesById = new RxMap<string, any>(
            rawEdges.map(edge => [edge.id, edge]))

        const valuesList = rawEdgesById.values()

        const selectedEdges = new RxSet<any>([rawEdges[0]])
        const valueWithSelected = valuesList.createSelection(selectedEdges)

        const selectedValues = valueWithSelected.map(([_, selected]) => selected)

        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, false])

        selectedEdges.add(rawEdges[1])
        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, true])

        // 新增一个 edge，然后再选中
        const newEdge = {id: 3, from: '1', to: '2'}
        rawEdgesById.set('3', newEdge)
        expect(valuesList.toArray()).toMatchObject([rawEdges[0], rawEdges[1], newEdge])
        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, true, false])

        //
        selectedEdges.add(newEdge)
        expect(selectedValues.toArray().map(v => v())).toMatchObject([true, true, true])
    })

    test('derived from RxList.indexBy', () => {
        const source = new RxList([{id:1, score:1}, {id:2, score:2}, {id:3, score:3}])
        const indexById = source.indexBy('id')

        const keys = indexById.keys()
        expect(keys.toArray()).toMatchObject([1, 2, 3])
        const values = indexById.values()
        expect(values.toArray()).toMatchObject([{id:1, score:1}, {id:2, score:2}, {id:3, score:3}])
    })

    test('derived from RxList.indexBy with empty source', () => {
        const source = new RxList<{id:number, score:number}>([])
        const indexById = source.indexBy('id')
        const keys = indexById.keys()
        const values = indexById.values()
        let recomputed = 0

        computed(() => {
            recomputed++
            values.forEach(v => v)
        })

        expect(indexById.entries().toArray()).toMatchObject([])
        expect(recomputed).toBe(1)

        source.splice(0, 0, {id:1, score:1}, {id:2, score:2}, {id:3, score:3})
        expect(keys.toArray()).toMatchObject([1, 2, 3])
        expect(values.toArray()).toMatchObject([{id:1, score:1}, {id:2, score:2}, {id:3, score:3}])

        expect(recomputed).toBe(2)
    })

})