import { RxList } from "../src/RxList.js";
import {describe, expect, test} from "vitest";

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


})