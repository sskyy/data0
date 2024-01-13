import { incMap } from "../src/incremental";
import { describe, test, expect } from "vitest";
import {reactive} from "../src/reactive";


describe('incremental map', () => {
    test('Array map', () => {
        const source = reactive([1,2,3])
        let mapFnRuns = 0
        const mappedArr = incMap(source, (item) => {
            mapFnRuns++
            return item + 3
        })
        expect(mappedArr).toShallowMatchObject([4,5,6])
        expect(mapFnRuns).toBe(3)

        source.splice(1, 0, 5)
        expect(mappedArr).toShallowMatchObject([4,8,5,6])
        expect(mapFnRuns).toBe(4)

        source.push(9, 10)
        expect(mappedArr).toShallowMatchObject([4,8,5,6,12, 13])
        expect(mapFnRuns).toBe(6)

        source.pop()
        expect(mappedArr).toShallowMatchObject([4,8,5,6,12])
        expect(mapFnRuns).toBe(6)

        source.shift()
        expect(mappedArr).toShallowMatchObject([8,5,6,12])
        expect(mapFnRuns).toBe(6)

        source.unshift(6, 8)
        expect(mappedArr).toShallowMatchObject([9, 11, 8,5,6,12])
        expect(mapFnRuns).toBe(8)

        source.splice(1, Infinity)
        expect(mappedArr).toShallowMatchObject([9])
        expect(mapFnRuns).toBe(8)

        source[0] = 2
        expect(mappedArr).toShallowMatchObject([5])
        expect(mapFnRuns).toBe(9)
    })

    test('Array map with key change', () => {
        const source = reactive([{id: 1}, {id: 2}, {id: 3}])
        let mapFnRuns = 0
        const mappedArr = incMap(source, (item) => {
            mapFnRuns++
            return { id: item.id + 3 }
        })
        // explicit key change
        source[0] = {id: 5}
        expect(mappedArr[0].id).toBe(8)

        // change two item
        expect(mappedArr[1].id).toBe(5)
        expect(mappedArr[2].id).toBe(6)

        let temp = source[1]
        source[1] = source[2]
        source[2] = temp
        expect(mappedArr[1].id).toBe(6)
        expect(mappedArr[2].id).toBe(5)
    })

    test('inc map with atom leaf', () => {
        const source = reactive([{id: 1}, {id: 2}, {id: 3}])
        let mapFnRuns = 0
        const mappedArr = incMap(source, (item) => {
            mapFnRuns++
            return item.$id
        })

        expect(mappedArr).toShallowMatchObject([1,2,3])
        expect(mapFnRuns).toBe(3)
        source[0].id = 5
        expect(mappedArr).toShallowMatchObject([5,2,3])
        expect(mapFnRuns).toBe(3)

        const source2 = reactive([{id: 1}, {id: 2}, {id: 3}])
        let mapFnRuns2 = 0
        const mappedArr2 = incMap(source2, (item) => {
            mapFnRuns2++
            return item.id
        })
        expect(mappedArr2).toShallowMatchObject([1,2,3])
        expect(mapFnRuns2).toBe(3)

        // CAUTION 特别注意，这里 incMap 设计的就是会对数据的神队改变进行响应，只对第一层响应。
        source2[0].id = 6
        expect(mappedArr2).toShallowMatchObject([1,2,3])
        expect(mapFnRuns2).toBe(3)

        source2[0] = {id: 6}
        expect(mappedArr2).toShallowMatchObject([6,2,3])
        expect(mapFnRuns2).toBe(4)

    })


    // test('Map map', () => {
    //
    // })
    //
    // test('Set map', () => {
    //
    // })
})


// describe('incremental merge & index related', () => {
//
// })
//
//
// describe('non-index incremental computation', () => {
//
// })

