import {describe, expect, test} from "vitest";
import {setDefaultScheduleRecomputedAsLazy} from "../src/index.js";
import {RxSet} from "../src/RxSet";

setDefaultScheduleRecomputedAsLazy(true)


describe('RxSet', () => {
    test('basic operations', () => {
        const set = new RxSet([1,2,3])
        expect(set.size()).toBe(3)
        expect(set.has(1).raw).toBe(true)
        expect(set.has(4).raw).toBe(false)
        set.add(4)
        expect(set.has(4).raw).toBe(true)
        set.delete(4)
        expect(set.has(4).raw).toBe(false)
        set.clear()
        expect(set.size()).toBe(0)
    })

    test('has',  () => {
        const set = new RxSet([1,2,3])
        const has1 = set.has(1)
        expect(has1()).toBe(true)
        set.delete(1)
        expect(has1()).toBe(false)
    })

    test('difference', () => {
        const set1 = new RxSet([1,2,3])
        const set2 = new RxSet([2,3,4])
        const diff = set1.difference(set2)
        expect(diff.toArray()).toMatchObject([1])

        set2.add(1)
        expect(diff.toArray()).toMatchObject([])

        set2.delete(2)
        expect(diff.toArray()).toMatchObject([2])
        set2.delete(4)
        expect(diff.toArray()).toMatchObject([2])
        set2.delete(1)
        expect(diff.toArray()).toMatchObject([2,1])

        set1.add(4)
        expect(diff.toArray()).toMatchObject([2,1, 4])
    })

    test('intersection', () => {
        const set1 = new RxSet([1,2,3])
        const set2 = new RxSet([2,3,4])
        const inter = set1.intersection(set2)
        expect(inter.toArray()).toMatchObject([2,3])

        set2.delete(2)
        // [1,2,3] [3,4]
        expect(inter.toArray()).toMatchObject([3])

        set2.delete(3)
        // [1,2,3] [4]
        expect(inter.toArray()).toMatchObject([])

        set2.add(1)
        // [1,2,3] [1,4]
        expect(inter.toArray()).toMatchObject([1])

        set1.add(4)
        // [1,2,3,4] [1,4]
        expect(inter.toArray()).toMatchObject([1,4])
    })



    test('union', () => {
        const set1 = new RxSet([1,2,3])
        const set2 = new RxSet([2,3,4])
        const union = set1.union(set2)
        expect(union.toArray()).toMatchObject([1,2,3,4])

        set2.delete(2)
        // [1,2,3] [3,4]
        expect(union.toArray()).toMatchObject([1,2,3,4])

        set2.delete(3)
        // [1,2,3] [4]
        expect(union.toArray()).toMatchObject([1,2,3,4])

        set1.delete(3)
        // [1,2] [4]
        expect(union.toArray()).toMatchObject([1,2,4])

        set1.delete(2)
        // [1] [4]
        expect(union.toArray()).toMatchObject([1,4])

        set1.add(5)
        // [1,5] [4]
        expect(union.toArray()).toMatchObject([1,4, 5])

        set2.add(6)
        // [1,5] [4,6]
        expect(union.toArray()).toMatchObject([1,4, 5, 6])
    })

    test('isSubsetOf', () => {
        const set1 = new RxSet([1,2,3])
        const set2 = new RxSet([2,3,4])
        const isSubsetOf2 = set1.isSubsetOf(set2)
        expect(isSubsetOf2()).toBe(false)
        set2.add(1)
        expect(isSubsetOf2()).toBe(true)

        set1.add(4)
        expect(isSubsetOf2()).toBe(true)

        set1.add(5)
        expect(isSubsetOf2()).toBe(false)

        set2.add(5)
        expect(isSubsetOf2()).toBe(true)
    })

    test('symmetricDifference', () => {
        const set1 = new RxSet([1,2,3])
        const set2 = new RxSet([2,3,4])
        const symDiff = set1.symmetricDifference(set2)
        expect(symDiff.toArray()).toMatchObject([1,4])

        set2.add(1)
        expect(symDiff.toArray()).toMatchObject([4])

        set2.delete(1)
        expect(symDiff.toArray()).toMatchObject([4,1])

        set1.add(4)
        expect(symDiff.toArray()).toMatchObject([1])

        set1.add(5)
        expect(symDiff.toArray()).toMatchObject([1,5])

    })

    test('isDisjointFrom', () => {
        const set1 = new RxSet([1,2,3])
        const set2 = new RxSet([4,5,6])
        const isDisjointFrom2 = set1.isDisjointFrom(set2)
        expect(isDisjointFrom2()).toBe(true)

        set2.add(3)
        expect(isDisjointFrom2()).toBe(false)

        set2.delete(3)
        expect(isDisjointFrom2()).toBe(true)

        set2.add(2)
        expect(isDisjointFrom2()).toBe(false)
    })


})