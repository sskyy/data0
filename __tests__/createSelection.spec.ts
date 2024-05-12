import {createSelection, RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {computed} from "../src/computed.js";
import {atom} from "../src/atom.js";


describe('RxList multiple match', () => {
    test('createMultiMatch using object item as key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = new RxList([list.at(0)!])
        const uniqueMatch = createSelection(list, selected)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, false, false])

        expect(innerRuns).toBe(4)

        // 新增
        selected.push(list.at(1)!)
        expect(selectedList.data.map(value => value())).toMatchObject([true, true, false, false])
        expect(innerRuns).toBe(5)

        // 连续新增
        selected.push(list.at(2)!)
        expect(selectedList.data.map(value => value())).toMatchObject([true, true, true, false])
        expect(innerRuns).toBe(6)

        // 删除
        selected.splice(1, 1)
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, true, false])
        expect(innerRuns).toBe(7)

        // source 删除
        list.splice(0, 1)
        expect(selectedList.data.map(value => value())).toMatchObject([false, true, false])
        expect(selected.data).toMatchObject([list.at(1)!])
        expect(innerRuns).toBe(7)
    })

    test('createMultiMatch using index key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = new RxList([0])
        const uniqueMatch = createSelection(list, selected, true)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, false, false])
        expect(innerRuns).toBe(4)

        // 新增
        selected.push(1)
        expect(selectedList.data.map(value => value())).toMatchObject([true, true, false, false])
        expect(innerRuns).toBe(5)

        // 连续新增
        selected.push(2)
        expect(selectedList.data.map(value => value())).toMatchObject([true, true, true, false])
        expect(innerRuns).toBe(6)

        // 删除
        selected.splice(1, 1)
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, true, false])
        expect(innerRuns).toBe(7)

        // source 删除
        list.splice(0, 1)
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, true])
        expect(innerRuns).toBe(10)
        // 重新插入
        list.unshift({id:0, score: 0})
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, true, false])
        expect(innerRuns).toBe(14)
    })

    test('create unique selection using object as key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = atom(list.at(0)!)
        const uniqueMatch = createSelection(list, selected)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, false, false])

        expect(innerRuns).toBe(4)

        selected(list.at(1)!)
        expect(selectedList.data.map(value => value())).toMatchObject([false, true, false, false])
        expect(innerRuns).toBe(6)

        // 连续修改
        selected(list.at(2)!)
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, true, false])
        expect(innerRuns).toBe(8)

        // 删除
        selected(null)
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, false, false])
        expect(innerRuns).toBe(9)

        // source 删除
        selected(list.at(0))
        expect(innerRuns).toBe(10)
        list.splice(0, 1)
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, false])
        expect(selected.raw).toBeNull()
        expect(innerRuns).toBe(10)
    })


    test('createUniqueMatch using index key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selectedValue = atom(0)
        const uniqueMatch = createSelection(list, selectedValue, true)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.data.map(value => value())).toMatchObject([true, false, false, false])
        expect(innerRuns).toBe(4)

        selectedValue(1)
        expect(selectedList.data.map(value => value())).toMatchObject([false, true, false, false])

        expect(innerRuns).toBe(6)

        selectedValue(2)
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, true, false])
        expect(innerRuns).toBe(8)

        list.push({id:5, score: 5})
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, true, false, false])

        list.unshift({id:0, score: 0})
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, true, false, false, false])

        selectedValue(null)
        expect(selectedList.data.map(value => value())).toMatchObject([false, false, false, false, false, false])
    })
})
