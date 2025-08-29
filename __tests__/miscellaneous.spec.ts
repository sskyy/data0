import {atom, incUnique, reactive, RxList} from "../src";
import {describe, expect, test} from "vitest";
import {arrayComputed, mapComputed} from "../src/computed";


describe('computed on computed', () => {
    test('atom & computed', () => {
        const atom1 = atom<{items: any[]}>(null)
        const computed1 = arrayComputed<any>(function computed1()  {
            return atom1()?.items || []
        })

        // splice 不触发 forEach 为什么？？？
        const computed2 = mapComputed(function computed2() {
            const result = new Map<string, any>()
            computed1.forEach((item: number) => {
                result.set(item.toString(), item)
            })
            return result
        })
        atom1({items: [1,2,3]})

        expect(computed1).toShallowMatchObject([1,2,3])

        expect(computed2.get('1')).toShallowEqual(1)
        expect(computed2.get('2')).toShallowEqual(2)
        expect(computed2.get('3')).toShallowEqual(3)

    })

    test('splice should trigger foreach', () => {

        const arr1: number[] = reactive([])
        const computed1 = mapComputed(() => {
            const result = new Map<string, any>()
            arr1.forEach((item: number) => {
                result.set(item.toString(), item)
            })
            return result
        })

        arr1.splice(0, 0, 1,2,3)
        expect(computed1.get('1')).toShallowEqual(1)

    })

    test('incUnique should recompute', () => {
        const origin: any[] = [1,2, 2]
        const atom1 = atom(null)
        const source = reactive(origin.concat(atom1))
        const uniqueSet = incUnique(source)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2, undefined])

        atom1(3)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2, 3])
        atom1(4)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2,4])
        atom1(1)
        expect(Array.from(uniqueSet)).toShallowMatchObject([1,2])
    })

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