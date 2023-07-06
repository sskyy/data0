import { incMap } from "../src/incremental";
import { describe, test, expect } from "@jest/globals";
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


    test('Map map', () => {

    })

    test('Set map', () => {

    })
})


describe('incremental merge & index related', () => {

})


describe('non-index incremental computation', () => {

})

