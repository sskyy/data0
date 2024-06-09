import {createIndexKeySelection, createSelection, RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {computed} from "../src/computed.js";
import {atom} from "../src/atom.js";
import {RxSet} from "../src/RxSet";


describe('RxList multiple match', () => {
    test('createMultiMatch using object item as key', async () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = new RxSet([list.at(0)!])
        const uniqueMatch = createSelection(list, selected, true)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, false, false])

        expect(innerRuns).toBe(4)

        // 新增
        selected.add(list.at(1)!)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, true, false, false])
        expect(innerRuns).toBe(5)

        // 连续新增
        selected.add(list.at(2)!)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, true, true, false])
        expect(innerRuns).toBe(6)

        // 删除
        selected.delete(list.at(1)!)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, true, false])
        expect(innerRuns).toBe(7)

        // source 删除第一个，因为设置了 autoReset，所以 selectedList 里面应该也要删掉
        list.splice(0, 1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, true, false])
        expect(selected.toArray()).toMatchObject([list.at(1)!])
        expect(innerRuns).toBe(7)
    })

    test('create unique selection using object as key', async () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = atom(list.at(0)!)
        const uniqueMatch = createSelection(list, selected, true)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, false, false])

        expect(innerRuns).toBe(4)

        selected(list.at(1)!)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, true, false, false])
        expect(innerRuns).toBe(6)

        // 连续修改
        selected(list.at(2)!)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, true, false])
        expect(innerRuns).toBe(8)

        // 删除
        selected(null)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, false, false])
        expect(innerRuns).toBe(9)

        // source 删除
        const first= list.at(0)
        selected(first)
        expect(innerRuns).toBe(10)
        // 删掉第一个
        list.splice(0, 1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, false])
        expect(selected.raw).toBeNull()
        expect(innerRuns).toBe(10)
    })

    test('create unique selection using object as key with value not reset', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = atom(list.at(0)!)
        const uniqueMatch = createSelection(list, selected, false)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, false, false])

        // source 删除
        const first= list.at(0)!
        selected(first)
        // 删掉第一个
        list.splice(0, 1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, false])
        // 还存在
        expect(selected.raw).not.toBeNull()
        // explicit key set
        list.set(1, first)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, true, false])
    })

    test('create unique selection using primitive value as key with value not reset', () => {
        const list = new RxList<string>(['a', 'b', 'c', 'd'])

        let innerRuns = 0

        const selected = atom('b')
        const uniqueMatch = list.createSelection(selected)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, true, false, false])

        selected('a')
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, false, false])

        // 删掉第一个
        list.splice(0, 1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, false])
        // 还存在
        expect(selected.raw).not.toBeNull()
        // explicit key set
        list.set(1, 'a')
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, true, false])
    })
})

describe('createSelection use index as key', () => {
    test('createMultiMatch using index key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        let innerRuns = 0

        const selected = new RxSet([0])
        const uniqueMatch = createIndexKeySelection(list, selected, true)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, false, false])
        expect(innerRuns).toBe(4)
        // 新增
        selected.add(1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, true, false, false])
        expect(innerRuns).toBe(5)

        // 连续新增
        selected.add(2)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, true, true, false])
        expect(innerRuns).toBe(6)

        // 删除
        selected.delete(1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, true, false])
        expect(innerRuns).toBe(7)

        // source 删除
        list.splice(0, 1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, true])
        expect(innerRuns).toBe(10)
        // 重新插入
        list.unshift({id:0, score: 0})
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, true, false])
        expect(innerRuns).toBe(14)
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
        const uniqueMatch = createIndexKeySelection(list, selectedValue, true)
        const selectedList = uniqueMatch.map(([_, selected]) => {
            return computed(() => {
                innerRuns++
                return selected()
            })
        })
        expect(selectedList.toArray().map(value => value())).toMatchObject([true, false, false, false])
        expect(innerRuns).toBe(4)

        selectedValue(1)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, true, false, false])

        expect(innerRuns).toBe(6)

        selectedValue(2)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, true, false])
        expect(innerRuns).toBe(8)

        list.push({id:5, score: 5})
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, true, false, false])

        list.unshift({id:0, score: 0})
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, true, false, false, false])

        selectedValue(null)
        expect(selectedList.toArray().map(value => value())).toMatchObject([false, false, false, false, false, false])
    })
})
