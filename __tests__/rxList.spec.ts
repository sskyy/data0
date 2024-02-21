import { RxList } from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {autorun} from "../src/autorun.js";

describe('RxList', () => {
    test('map to another list', () => {
        const list = new RxList<number>([1,2,3])
        let mapRuns = 0
        const list2 = list.map((item) => {
            mapRuns++
            return item * 2
        })
        expect(list2.data).toMatchObject([2,4,6])
        expect(mapRuns).toBe(3)

        // splice 以后仍然保持正确
        list.splice(1,1)
        expect(list2.data).toMatchObject([2,6])
        expect(mapRuns).toBe(3)

        // splice 添加元素
        list.splice(1,0, 3)
        expect(list2.data).toMatchObject([2,6,6])
        expect(mapRuns).toBe(4)

        // 通过 set 修改元素
        list.set(1, 4)
        expect(list2.data).toMatchObject([2,8,6])
        expect(mapRuns).toBe(5)
    })

    test('map to another list with index', () => {
        const list = new RxList<number>([1,2,3])
        let mapRuns = 0
        const list2 = list.map((item, index) => {
            mapRuns++
            return item * index!()
        })
        expect(list2.data).toMatchObject([0,2,6])
        expect(mapRuns).toBe(3)

        // splice 以后仍然保持正确
        list.splice(1,1)
        expect(list2.data).toMatchObject([0,6])
        expect(mapRuns).toBe(3)

        // splice 添加元素
        list.splice(1,0, 3)
        expect(list2.data).toMatchObject([0,3,6])
        expect(mapRuns).toBe(4)

        // 通过 set 修改元素
        list.set(1, 4)
        expect(list2.data).toMatchObject([0,4,6])
        expect(mapRuns).toBe(5)
    })

    test('reduce', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const reducedList = list.reduce<{id:number, score: number}>((newList, item) => {
            const findIndex = newList.data.findIndex(i => i.id === item.id)
            if (findIndex !== -1) {
                newList.splice(findIndex, 1)
            }
            newList.push(item)
        })

        expect(reducedList.data).toMatchObject([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        list.push({id:5, score: 5})
        expect(reducedList.data).toMatchObject([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4},
            {id:5, score: 5},
        ])

        list.push({id:1, score: 6})
        expect(reducedList.data).toMatchObject([
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4},
            {id:5, score: 5},
            {id:1, score: 6},
        ])

    })


    test('find', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const found = list.find(item => item.score > 2)
        expect(found()).toMatchObject({id:3, score: 3})

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(found()).toMatchObject({id:4, score: 4})

        // splice 在后面，没有影响
        list.splice(4, 0, {id: 0, score: 3})
        expect(found()).toMatchObject({id:4, score: 4})
        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(found()).toMatchObject({id:5, score: 3})

        list.splice(2, Infinity)
        expect(found()).toBe(null)

    })

    test('findIndex', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const found = list.findIndex(item => item.score > 2)
        expect(found()).toBe(2)

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(found()).toBe(3)

        // splice 在后面，没有影响
        list.splice(4, 0, {id: 0, score: 3})
        expect(found()).toBe(3)
        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(found()).toBe(3)

        list.splice(2, Infinity)
        expect(found()).toBe(-1)
    })

    test('filter', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const filtered = list.filter(item => item.score > 2)
        expect(filtered.data).toMatchObject([
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(filtered.data).toMatchObject([
            {id:4, score: 4}
        ])

        list.splice(4, 0, {id: 0, score: 3})
        expect(filtered.data).toMatchObject([
            {id:4, score: 4},
            {id:0, score: 3},
        ])
        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(filtered.data).toMatchObject([
            {id:4, score: 4},
            {id:0, score: 3},
            {id:5, score: 3},
        ])

        list.splice(2, Infinity)
        expect(filtered.data).toMatchObject([])
    })

    // should track iterator key
    test('forEach', () => {
        const list = new RxList<number>([1,2,3])
        let forEachRuns = 0
        autorun(() => {
            forEachRuns++
            list.forEach((item) => {
            })
        })
        expect(forEachRuns).toBe(1)

        list.push(4)
        expect(forEachRuns).toBe(2)

        list.splice(1, 1)
        expect(forEachRuns).toBe(3)
    })


    // groupBy
    test('groupBy', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const grouped = list.groupBy(item => item.score > 2 ? 'high' : 'low')
        expect(Array.from(grouped.data.keys())).toMatchObject(['low', 'high'])
        expect(grouped.data.get('low')!.data).toMatchObject([{id:1, score: 1}, {id:2, score: 2}])
        expect(grouped.data.get('high')!.data).toMatchObject([{id:3, score: 3}, {id:4, score: 4}])

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(grouped.data.get('low')!.data).toMatchObject([{id:1, score: 1}, {id:2, score: 2}, {id: 3, score: 1}])
        expect(grouped.data.get('high')!.data).toMatchObject([{id:4, score: 4}])


        list.splice(4, 0, {id: 0, score: 3})
        expect(grouped.data.get('low')!.data).toMatchObject([{id:1, score: 1}, {id:2, score: 2}, {id: 3, score: 1}])
        expect(grouped.data.get('high')!.data).toMatchObject([{id:4, score: 4}, {id: 0, score: 3}])

        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(grouped.data.get('low')!.data).toMatchObject([{id:1, score: 1}, {id:2, score: 2}, {id: 3, score: 1}])
        expect(grouped.data.get('high')!.data).toMatchObject([{id:4, score: 4}, {id: 0, score: 3}, {id: 5, score: 3}])

        list.splice(2, Infinity)
        expect(grouped.data.get('low')!.data).toMatchObject([{id:1, score: 1}, {id:2, score: 2}])
        expect(grouped.data.get('high')!.data).toMatchObject([])
    })


    // indexBy
    test('indexBy', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const indexed = list.indexBy('id')
        expect(Array.from(indexed.data.entries())).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
                [3, {id:3, score: 3}],
                [4, {id:4, score: 4}]
            ]
        )

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(Array.from(indexed.data.entries())).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
                [4, {id:4, score: 4}],
                [3, {id:3, score: 1}],
            ]
        )



        list.splice(4, 0, {id: 0, score: 3})
        expect(Array.from(indexed.data.entries())).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
                [4, {id:4, score: 4}],
                [3, {id:3, score: 1}],
                [0, {id:0, score: 3}]
            ]
        )



        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(Array.from(indexed.data.entries())).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
                [4, {id:4, score: 4}],
                [3, {id:3, score: 1}],
                [0, {id:0, score: 3}],
                [5, {id:5, score: 3}]
            ]
        )


        list.splice(2, Infinity)
        expect(Array.from(indexed.data.entries())).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
            ]
        )
    })
})