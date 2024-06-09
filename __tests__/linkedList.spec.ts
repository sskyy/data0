import {arrayComputed} from "../src/computed";
import {LinkedList} from '../src/LinkedList'
import {describe, expect, test} from "vitest";


describe('computed based on linkedList', () => {
    test('atom & computed', () => {
        const list = new LinkedList([{value: 1}, {value:2}, {value: 3}])

        const computedArr = arrayComputed(() => {
            const result = []
            for(let i of list) {
                result.push(i.item.value)
            }
            return result
        })

        expect(computedArr).toShallowMatchObject([1,2,3])

        const newNode = list.insertBefore({value: 4})
        expect(computedArr).toShallowMatchObject([1,2,3, 4])

        list.insertBefore({value: 5}, newNode)
        expect(computedArr).toShallowMatchObject([1,2,3, 5, 4])
    })

})

