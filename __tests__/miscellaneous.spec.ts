import {atom, RxList} from "../src";
import {describe, expect, test} from "vitest";


describe('computed on computed', () => {
    test('chained computed, filter,map, then re-compute, then filter,map', async () => {
        const data = atom([1, 2, 3, 4])
        const list = new RxList<number>(() => data())
        const even = list.filter(x => x % 2 === 0)
        const doubled = even.map(x => {
            return x * 2
        })
        expect(even.toArray()).toEqual([2, 4])
        expect(doubled.toArray()).toEqual([4, 8])
  
        data([1,2,3,4,5,6])
        expect(even.toArray()).toEqual([2, 4, 6])
        expect(doubled.toArray()).toEqual([4, 8, 12])
      })

      test('list sort self, should trigger mapped list re-compute', () => {
        const list = new RxList<number>(() => [3, 1, 2, 4, 5])
        const doubled = list.map(x => x * 2)
        list.sortSelf((a, b) => a - b)
        expect(list.toArray()).toEqual([1, 2, 3, 4, 5])
        expect(doubled.toArray()).toEqual([2, 4, 6, 8, 10])
      })


      test('RxList#map, then #sortSelf(), then #splice()', () => {
        const list = new RxList([3, 1, 5, 2, 4]);
        const doubled = list.map((v) => v * 2)
        list.sortSelf((a, b) => a - b);
        list.splice(0, 1)
        expect(list.toArray()).toMatchObject([2, 3, 4, 5]);
        expect(doubled.toArray()).toMatchObject([4, 6, 8, 10])
      });
})