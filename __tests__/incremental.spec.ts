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

        source.splice(1)
        expect(mappedArr).toShallowMatchObject([9])
        expect(mapFnRuns).toBe(8)
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

