import {createSelection, RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {Atom, AtomComputed, computed, once} from "../src/index.js";
import {autorun} from "../src/common";
import {atom} from "../src/atom.js";
import {RxSet} from "../src/RxSet";


describe('RxList', () => {
    test('map to another list', () => {
        const list = new RxList<number>([1,2,3])
        let mapRuns = 0
        const list2 = list.map((item) => {
            mapRuns++
            return item * 2
        })
        expect(list2.toArray()).toMatchObject([2,4,6])
        expect(mapRuns).toBe(3)

        // splice 以后仍然保持正确
        list.splice(1,1)
        expect(list2.toArray()).toMatchObject([2,6])
        expect(mapRuns).toBe(3)

        // splice 添加元素
        list.splice(1,0, 3)
        expect(list2.toArray()).toMatchObject([2,6,6])
        expect(mapRuns).toBe(4)

        // 通过 set 修改元素
        list.set(1, 4)
        expect(list2.toArray()).toMatchObject([2,8,6])
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
        list.splice(1,1) // 变成了 1,3
        // expect(list.atomIndexes!.map(i => i())).toMatchObject([0,1])
        expect(list2.data).toMatchObject([0,3])
        expect(mapRuns).toBe(4)

        // splice 添加元素
        list.splice(1,0, 5) // 变成了 1,5,3
        expect(list.atomIndexes!.map(i => i())).toMatchObject([0,1, 2])
        expect(list2.toArray()).toMatchObject([0,5,6])
        expect(mapRuns).toBe(6)

        // 通过 set 修改元素
        list.set(1, 4) // 变成了 1,4,3
        expect(list2.toArray()).toMatchObject([0,4,6])
        expect(mapRuns).toBe(7)
    })

    test('map to another list with inner computed', () => {
        const list = new RxList<number>([1,2,3])
        let mapRuns = 0
        const outerAtom = atom(1)

        const list2 = list.map((item) => {
            return computed(() =>{
                mapRuns++
                return item * outerAtom()
            })
        })

        expect(list2.toArray().map(i => i())).toMatchObject([1,2,3])
        expect(mapRuns).toBe(3)
        outerAtom(2)
        expect(list2.toArray().map(i => i())).toMatchObject([2,4,6])
        expect(mapRuns).toBe(6)

        // removed computed in list should be destroyed
        list.pop()
        expect(mapRuns).toBe(6)
        outerAtom(3)
        expect(list2.toArray().map(i => i())).toMatchObject([3,6])
        expect(mapRuns).toBe(8)
    })

    test('map to another list with inner computed each', () => {
        const list = new RxList<any>([{
            record: atom({name:'a'})
        }, {
            record: atom({name:'b'}),
        }])
        let mapRuns = 0

        const list2 = list.map((item) => {
            mapRuns++
            const record = item.record()
            return record.name
        })

        expect(list2.toArray()).toMatchObject(['a', 'b'])
        expect(mapRuns).toBe(2)

        list.at(0).record({name: 'c'})
        expect(list2.toArray()).toMatchObject(['c', 'b'])
        expect(mapRuns).toBe(3)

        list.at(1).record({name: 'd'})
        expect(list2.toArray()).toMatchObject(['c', 'd'])
        expect(mapRuns).toBe(4)

        // 新加入的元素也要能响应
        list.unshift({record: atom({name: 'e'})})
        list.unshift({record: atom({name: 'f'})})

        expect(list2.toArray()).toMatchObject(['f', 'e', 'c', 'd'])
        expect(mapRuns).toBe(6)
        list.at(0).record({name: 'g'})
        list.at(1).record({name: 'h'})
        expect(list2.toArray()).toMatchObject(['g', 'h', 'c', 'd'])
        expect(mapRuns).toBe(8)
    })

    test('map to another list with outer reactive', () => {
        const list = new RxList<number>([1,2,3])
        let mapRuns = 0
        const outerAtom = atom(1)

        const list2 = list.map((item) => {
            mapRuns++
            return item * outerAtom()
        })

        expect(list2.data).toMatchObject([1,2,3])
        expect(mapRuns).toBe(3)
        outerAtom(2)
        expect(list2.data).toMatchObject([2,4,6])
        expect(mapRuns).toBe(6)

        // removed computed in list should be destroyed
        list.pop()
        expect(mapRuns).toBe(6)
        outerAtom(3)
        expect(list2.data).toMatchObject([3,6])
        expect(mapRuns).toBe(8)
    })

    test('map to another list with cleanups', () => {
        const list = new RxList<number>([1,2,3])
        const innerOnCleanupResult: any[] = []
        const optionCleanupResult: any[] = []

        const list2 = list.map((item, index, {onCleanup}) => {
            onCleanup(() => {
                innerOnCleanupResult.push(item)
            })
            return item * 2
        }, {
            onCleanup: (item) => {
                optionCleanupResult.push(item)
            }
        })

        expect(list2.toArray()).toMatchObject([2,4,6])
        list.splice(1,1)
        expect(list2.toArray()).toMatchObject([2,6])
        // 通过读取来触发一下重算
        expect(innerOnCleanupResult).toMatchObject([2])
        expect(optionCleanupResult).toMatchObject([4])

        // 剩下 1,3。 unshift 之后变成 0,1,2,1,3
        list.unshift(0, 1,2)
        expect(list.toArray()).toMatchObject([0,1,2,1,3])
        expect(list2.toArray()).toMatchObject([0,2,4,2,6])

        // 再次 splice，变成 0,1,3
        list.splice(1,2)
        expect(list.toArray()).toMatchObject([0,1,3])
        expect(list2.toArray()).toMatchObject([0,2,6])
        expect(innerOnCleanupResult).toMatchObject([2,1,2])
        expect(optionCleanupResult).toMatchObject([4,2,4])
    })

    test('reduce to a atom', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const total = list.reduce<AtomComputed>((result, item) => {
            result.data((result.data.raw||0) + item.score)
        }, AtomComputed).data

        expect(total()).toBe(10)

        list.push({id:5, score: 5})
        expect(total()).toBe(15)

        list.unshift({id:1, score: 6})
        expect(total()).toBe(21)
    })

    test('reduce to a atom with reduceToAtom', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const total = list.reduceToAtom<number>((result, item) => {
            return result + item.score
        }, 0)

        expect(total()).toBe(10)

        list.push({id:5, score: 5})
        expect(total()).toBe(15)

        list.unshift({id:0, score: 6})
        expect(total()).toBe(21)

        list.splice(1, 1)
        expect(total()).toBe(20)

        list.splice(1, 0, {id:99,score:99})
        expect(total()).toBe(119)
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
        expect(found()).toBe(undefined)
    })

    test('find with reactive in find condition', () => {
        const list = new RxList<{id:number, score: Atom<number>}>([])
        const found = list.find(item => item.score() > 2)
        expect(found()).toBe(undefined)

        const i1 = {id:1, score: atom(1)}
        const i2 = {id:1, score: atom(1)}
        const i3 = {id:1, score: atom(1)}
        list.splice(0, 0, i1,i2,i3)

        expect(found()).toBe(undefined)
        i1.score(3)
        expect(found()).toBe(i1)

        i2.score(4)
        expect(found()).toBe(i1)

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

    test('findIndex with reactive in find condition', () => {
        const list = new RxList<{id:number, score: Atom<number>}>([])
        const found = list.findIndex(item => item.score() > 2)
        expect(found()).toBe(-1)

        const i1 = {id:1, score: atom(1)}
        const i2 = {id:1, score: atom(1)}
        const i3 = {id:1, score: atom(1)}
        list.splice(0, 0, i1,i2,i3)

        expect(found()).toBe(-1)
        i1.score(3)
        expect(found()).toBe(0)

        i2.score(4)
        expect(found()).toBe(0)

        i1.score(1)
        expect(found()).toBe(1)
    })

    test('filter', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const filtered = list.filter(item => item.score > 2)
        expect(filtered.toArray()).toMatchObject([
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(filtered.toArray()).toMatchObject([
            {id:4, score: 4}
        ])

        list.splice(4, 0, {id: 0, score: 3})
        expect(filtered.toArray()).toMatchObject([
            {id:4, score: 4},
            {id:0, score: 3},
        ])
        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(filtered.toArray()).toMatchObject([
            {id:4, score: 4},
            {id:0, score: 3},
            {id:5, score: 3},
        ])

        list.splice(2, Infinity)
        expect(filtered.toArray()).toMatchObject([])
    })

    test('filter with external reactive dep', () => {
        const standard = atom(2)
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const filtered = list.filter(item => item.score > standard())
        expect(filtered.toArray()).toMatchObject([
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        standard(3)
        expect(filtered.toArray()).toMatchObject([
            {id:4, score: 4}
        ])
    })

    test('filter with new items', () => {
        const standard = atom(2)
        const list = new RxList<{id:number, score: number}>([])
        const filtered = list.filter(item => item.score > standard())
        expect(filtered.toArray()).toMatchObject([])
        list.push({id:1, score: 1})
        expect(filtered.toArray()).toMatchObject([])
        list.push({id:2, score: 3})
        expect(filtered.toArray()).toMatchObject([{id:2, score: 3}])
        list.push({id:3, score: 4})
        expect(filtered.toArray()).toMatchObject([{id:2, score: 3}, {id:3, score: 4}])
    })

    test('filter with computed in item', () => {
        const createItem = ( id:number, score = 0) => {
            return {
                id,
                score: atom(score)
            }
        }
        const i1 = createItem(1)
        const i2 = createItem(2)
        const i3 = createItem(3)
        const list = new RxList<{id:number, score: Atom<number>}>([])

        const filtered = list.filter(item => item.score() > 3)

        // 新添加进去的，应该也要能响应
        list.splice(0, 0, i1, i2, i3)

        expect(filtered.toArray()).toMatchObject([])
        i1.score(4)
        expect(filtered.toArray().map(f => f.id)).toMatchObject([1])
        i2.score(5)
        expect(filtered.toArray().map(f => f.id)).toMatchObject([1,2])
    })

    test('filter with unshift new item', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4},
            {id:5, score: 5},
        ])
        const filtered = list.filter(item => item.score > 3)
        expect(filtered.toArray().map(i => i.id)).toMatchObject([4,5])
        list.unshift({id:6, score: 6})
        expect(filtered.toArray().map(i => i.id)).toMatchObject([6,4,5,])
    })

    // should track iterator key
    test('forEach', () => {
        const list = new RxList<number>([1,2,3])
        let forEachRuns = 0
        autorun(() => {
            forEachRuns++
            list.forEach((item) => {
            })
        }, true)
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
        expect(Array.from(grouped.keys().toArray())).toMatchObject(['low', 'high'])
        expect(grouped.data.get('low')!.toArray()).toMatchObject([{id:1, score: 1}, {id:2, score: 2}])
        expect(grouped.data.get('high')!.toArray()).toMatchObject([{id:3, score: 3}, {id:4, score: 4}])

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(grouped.get('low')!.toArray()).toMatchObject([{id:1, score: 1}, {id:2, score: 2}, {id: 3, score: 1}])
        expect(grouped.get('high')!.toArray()).toMatchObject([{id:4, score: 4}])


        list.splice(4, 0, {id: 0, score: 3})
        expect(grouped.get('low')!.toArray()).toMatchObject([{id:1, score: 1}, {id:2, score: 2}, {id: 3, score: 1}])
        expect(grouped.get('high')!.toArray()).toMatchObject([{id:4, score: 4}, {id: 0, score: 3}])

        // splice 在前面，有影响
        list.splice(3, 0, {id: 5, score: 3})
        expect(grouped.get('low')!.toArray()).toMatchObject([{id:1, score: 1}, {id:2, score: 2}, {id: 3, score: 1}])
        expect(grouped.get('high')!.toArray()).toMatchObject([{id:4, score: 4}, {id: 0, score: 3}, {id: 5, score: 3}])

        list.splice(2, Infinity)
        expect(grouped.get('low')!.toArray()).toMatchObject([{id:1, score: 1}, {id:2, score: 2}])
        expect(grouped.get('high')!.toArray()).toMatchObject([])
    })

    test('every with true to false', () => {
        const list = new RxList([1,2,3,4,5,6,7,8,9])
        const everyGT0 = list.every(i => i > 0)
        expect(everyGT0()).toBe(true)

        // push 10 没有影响
        list.push(10)
        expect(everyGT0()).toBe(true)

        // unshift 1 没有影响
        list.unshift(1)
        expect(everyGT0()).toBe(true)

        // unshift -1 在第一个 mismatch 之前，gt0 变 false
        list.unshift(-1)
        expect(everyGT0()).toBe(false)

        // shift -1 ，gt0 变 true
        list.shift()
        expect(everyGT0()).toBe(true)
    })

    test('every with false to true', () => {
        const list = new RxList([1,2,3,4,5,6,7,8,9])
        const everyLT5 = list.every(i => i <5)
        expect(everyLT5()).toBe(false)

        // push 10 没有影响
        list.push(10)
        expect(everyLT5()).toBe(false)

        // pop 没有影响
        list.pop()
        expect(everyLT5()).toBe(false)

        // 在 1 后面插入一个 10，没有影响
        list.splice(1, 0, 10)
        expect(everyLT5()).toBe(false)

        // unshift 0 没有影响
        list.unshift(0)
        expect(everyLT5()).toBe(false)


        list.splice(1, Infinity)
        expect(everyLT5()).toBe(true)
    })

    test('some', () => {
        const list = new RxList([1,2,3,4,5,6,7,8,9])
        const anyGT5 = list.some(i => i > 5)
        expect(anyGT5()).toBe(true)

        // push 4 没有影响
        list.push(4)
        expect(anyGT5()).toBe(true)

        // unshift 6 没有影响
        list.unshift(6)
        expect(anyGT5()).toBe(true)

        // shift 6 没影响
        list.shift()
        expect(anyGT5()).toBe(true)

        // pop 4 ，没影响
        list.pop()
        expect(anyGT5()).toBe(true)

        // 从 5 开始全部删了，没有大于 5 的了
        list.splice(4, Infinity)
        expect(anyGT5()).toBe(false)
    })

    test('some with reactive in condition', () => {
        const list = new RxList<{id:number, score: Atom<number>}>([])
        const anyGT5 = list.some(i => i.score() > 5)

        const i1 = {id:1, score: atom(1)}
        const i2 = {id:1, score: atom(1)}
        const i3 = {id:1, score: atom(1)}

        list.splice(0, 0, i1,i2,i3)
        expect(anyGT5()).toBe(false)

        i1.score(6)
        expect(anyGT5()).toBe(true)

        i2.score(6)
        expect(anyGT5()).toBe(true)

        i1.score(1)
        expect(anyGT5()).toBe(true)

        i2.score(1)
        expect(anyGT5()).toBe(false)
    })

    test('some with complex internal computed', () => {
        const collections = new RxList([
            new RxList<any>([]),
            new RxList<any>([]),
        ])

        const notEmpty = collections.some(c => c.length() > 0)
        expect(notEmpty()).toBe(false)

        collections.at(0)!.push(1)
        expect(notEmpty()).toBe(true)

        collections.at(0)!.splice(0,1)
        expect(notEmpty()).toBe(false)
    })


    test('groupBy with non-exist key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const grouped = list.groupBy(item => item.score > 4 ? 'high' : 'low')
        expect(Array.from(grouped.keys().toArray())).toMatchObject(['low'])

        const highList = computed(() => grouped.get('high')?.toArray() || [])
        expect(highList()).toMatchObject([])

        list.push({id: 5, score: 5})
        expect(Array.from(grouped.keys().toArray())).toMatchObject(['low', 'high'])
        expect(grouped.get('high')!.toArray()).toMatchObject([{id: 5, score: 5}])
        expect(highList()).toMatchObject([{id: 5, score: 5}])
    })

    test('groupBy grouped list order align with source', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const grouped = list.groupBy(item => item.score > 4 ? 'high' : 'low')
        expect(Array.from(grouped.keys().toArray())).toMatchObject(['low'])

        list.push({id: 5, score: 5})
        expect(grouped.get('high')!.toArray()).toMatchObject([{id: 5, score: 5}])

        list.push({id:6, score: 4})
        expect(grouped.get('low')!.toArray().at(-1)).toMatchObject({id: 6, score: 4})

        list.unshift({id:7, score: 4})
        expect(grouped.get('low')!.toArray().at(0)).toMatchObject({id: 7, score: 4})

        list.unshift({id:8, score: 5})
        expect(grouped.get('high')!.toArray().at(0)).toMatchObject({id: 8, score: 5})
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
        expect(indexed.entries().toArray()).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
                [3, {id:3, score: 3}],
                [4, {id:4, score: 4}]
            ]
        )

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(indexed.entries().toArray()).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
                [4, {id:4, score: 4}],
                [3, {id:3, score: 1}],
            ]
        )

        list.splice(4, 0, {id: 0, score: 3})
        expect(indexed.entries().toArray()).toMatchObject(
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
        expect(indexed.entries().toArray()).toMatchObject(
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
        expect(indexed.entries().toArray()).toMatchObject(
            [
                [1, {id:1, score: 1}],
                [2, {id:2, score: 2}],
            ]
        )
    })

    test('indexBy with custom key', () => {
        const list = new RxList<{id:number, score: number}>([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        const indexed = list.indexBy(item => item.id + 1)
        expect(indexed.entries().toArray()).toMatchObject(
            [
                [2, {id:1, score: 1}],
                [3, {id:2, score: 2}],
                [4, {id:3, score: 3}],
                [5, {id:4, score: 4}]
            ]
        )

        // explicit key change
        list.set(2, {id: 3, score: 1})
        expect(indexed.entries().toArray()).toMatchObject(
            [
                [2, {id:1, score: 1}],
                [3, {id:2, score: 2}],
                [5, {id:4, score: 4}],
                [4, {id:3, score: 1}],
            ]
        )

        list.splice(1, 1, {id: 0, score: 3})
        expect(indexed.entries().toArray()).toMatchObject(
            [
                [2, {id:1, score: 1}],
                [5, {id:4, score: 4}],
                [4, {id:3, score: 1}],
                [1, {id:0, score: 3}],
            ]
        )
    })

    test('toSet', () => {
        const list = new RxList<number>([1,2,3])
        const set = list.toSet()
        expect(set.toArray()).toMatchObject([1,2,3])

        list.push(4)
        expect(set.toArray()).toMatchObject([1,2,3,4])

        list.splice(1, 1)
        expect(set.toArray()).toMatchObject([1,3,4])
    })
})

// chained computed
describe('RxList chained computed', () => {
    test('chained computed', () => {
        const showMore = atom(false)
        const list = new RxList<number>(()=> {
            return showMore() ? [1,2,3,4,5] : [1,2,3]
        })
        const computedList = list.map(item =>  item * 2)
        expect(computedList.toArray()).toMatchObject([2,4,6])

        showMore(true)
        expect(computedList.toArray()).toMatchObject([2,4,6,8,10])
    })

    test('chained with createSelection', () => {
        const showMore = atom(false)
        const selected = new RxSet<number>( ()=> {
            return showMore() ? [1,2,3,4,5] : [1,2,3]
        })

        const list = new RxList([1,2,3,4,5,6,7])

        const selectionList = createSelection(list, selected)

        const computedList = selectionList.map(([_, selected]) => {
            return selected
        })

        const itemToSelected = selectionList.toMap()

        expect(computedList.toArray().map(i => i())).toMatchObject([true,true,true, false, false, false, false])
        expect(itemToSelected.get(1)!()).toBe(true)
        expect(itemToSelected.get(2)!()).toBe(true)
        expect(itemToSelected.get(3)!()).toBe(true)


        showMore(true)
        computedList.toArray()
        expect(computedList.toArray().map(i => i())).toMatchObject([true,true,true, true, true, false, false])
        expect(itemToSelected.get(1)!()).toBe(true)
        expect(itemToSelected.get(2)!()).toBe(true)
        expect(itemToSelected.get(3)!()).toBe(true)
        expect(itemToSelected.get(4)!()).toBe(true)
        expect(itemToSelected.get(5)!()).toBe(true)

    })


    test('chained with async', async () => {

        const currentPage = atom(1)
        const rowsPerPage = atom(1)

        const tasks = new RxList<{id: number}>(async function() {
            const result = Array(rowsPerPage()).fill((currentPage()-1)*rowsPerPage()).map((i, index) => ({id:i+index}))
            await new Promise(resolve => setTimeout(resolve, 100))
            return result
        })

        const selectedIds = new RxSet<number>([])
        const taskIds = tasks.map(task => task.id)
        const taskIdsWithSelection = taskIds.createSelection(selectedIds)
        const taskIdToSelection = taskIdsWithSelection.toMap()

        let id2Runs = 0
        let id3Runs = 0
        let id4Runs = 0

        taskIds.on('recompute', () => {
            id2Runs++
        })


        taskIdsWithSelection.on('recompute', ()=> {
            id3Runs++
        })


        taskIdToSelection.on('recompute', ()=> {
            id4Runs++
        })

        // 2,3,4
        let id5Runs = 0
        let id6Runs = 0

        const tasksWithSelection = tasks.map(task => {
            id5Runs++
            return {
                task,
                // selected: taskIdToSelection.get(task.id)
                selected: computed(function(){
                    id6Runs++
                    return taskIdToSelection.get(task.id)?.()
                })
            }
        })



        let id7Runs = 0

        let selectedList:any[] = []

        autorun(() => {
            id7Runs++
            selectedList = []
            tasksWithSelection.forEach((i) => {
                selectedList.push(i.selected())
            })
        }, true)

        expect(selectedList).toMatchObject([])
        await new Promise(resolve => setTimeout(resolve, 400))

        expect(id2Runs).toBe(1)
        expect(id3Runs).toBe(1)
        expect(id4Runs).toBe(1)
        expect(id5Runs).toBe(1)
        expect(id6Runs).toBe(2)
        expect(id7Runs).toBe(3)

        expect(selectedList).toMatchObject([false])



        const currentPageSelectedIds = selectedIds.intersection(taskIds.toSet())
        const allSelected = computed<boolean>(function() {
            return !!(taskIds.length() && currentPageSelectedIds.size() === taskIds.length())
        })

        // CAUTION 这里用两个 autorun 是为了模拟多个 dependent 的情况
        let isAllSelected = false
        autorun(() => {
            isAllSelected = allSelected()
        },true)

        let isAllSelected2 = false
        autorun(function(){
            isAllSelected2 = allSelected()
        },true)

        expect(isAllSelected).toBe(false)
        expect(isAllSelected2).toBe(false)

        selectedIds.add(0)
        expect(id6Runs).toBe(3)
        expect(id7Runs).toBe(4)
        expect(selectedList).toMatchObject([true])
        expect(isAllSelected).toBe(true)
        expect(isAllSelected2).toBe(true)
        // FIXME

    })
})

describe('RxList reorder', () => {

    test('reposition', () => {
        const raw = [1,2,3,4,5]
        const origin = new RxList([...raw])
        // 从前往后移动
        origin.reposition(1, 3)
        expect(origin.toArray()).toMatchObject([1,3,4,2,5])

        // 往前移动
        const origin2 = new RxList([...raw])
        origin2.reposition(3, 1)
        expect(origin2.toArray()).toMatchObject([1,4,2,3,5])

        // 一次移动多个往后
        const raw2 = [1,2,3,4,5, 6,7,8,9,10]
        const origin3 = new RxList([...raw2])
        origin3.reposition(1, 3, 5)
        expect(origin3.toArray()).toMatchObject([1,7,8,2,3,4,5,6,9,10])

        // 一次往前移动多个
        const origin4 = new RxList([...raw2])
        origin4.reposition(3, 1, 5)
        expect(origin4.toArray()).toMatchObject([1,4,5,6,7,8,2,3,9,10])
    })

    test('swap', () => {
        const raw = [1,2,3,4,5]
        const origin = new RxList([...raw])
        origin.swap(1, 3)
        expect(origin.toArray()).toMatchObject([1,4,3,2,5])

        const origin2 = new RxList([...raw])
        origin2.swap(3, 1)
        expect(origin2.toArray()).toMatchObject([1,4,3,2,5])
    })

    test('sortSelf', () => {
        const raw = [1,2,3,4,5]
        const origin = new RxList([...raw])
        origin.sortSelf((a, b) => a - b)
        expect(origin.toArray()).toMatchObject([1,2,3,4,5])

        const origin2 = new RxList([...raw])
        origin2.sortSelf((a, b) => b - a)
        expect(origin2.toArray()).toMatchObject([5,4,3,2,1])

        // 乱序的情况
        const origin3 = new RxList([3,1,5,2,4])
        origin3.sortSelf((a, b) => a - b)
        expect(origin3.toArray()).toMatchObject([1,2,3,4,5])
    })

    test('list to map with index atom', () => {
        const list = new RxList<number>([1,2,3,4,5])
        const mapWithIndex = list.map((item, index) => [item, index]).toMap()
        const entries = mapWithIndex.entries()
        let mapRuns = 0
        const mappedEntries = entries.map(([item, index]) => {
            mapRuns++
            return [item, index()]
        })
        expect(mappedEntries.toArray()).toMatchObject([
            [1, 0],
            [2, 1],
            [3, 2],
            [4, 3],
            [5, 4]
        ])
        expect(mapRuns).toBe(5)

        list.sortSelf((a, b) => b - a)
        expect(mappedEntries.toArray()).toMatchObject([
            [1, 4],
            [2, 3],
            [3, 2],
            [4, 1],
            [5, 0]
        ])
        //中间 3 没变，所有只有 4 个重新计算
        expect(mapRuns).toBe(9)

        list.swap(1, 3)
        expect(mapRuns).toBe(11)
        expect(mappedEntries.toArray()).toMatchObject([
            [1, 4],
            [2, 1],
            [3, 2],
            [4, 3],
            [5, 0]
        ])

        expect(list.toArray()).toMatchObject([5,2,3,4,1])
        list.reposition(1, 3)
        expect(list.toArray()).toMatchObject([5,3,4,2,1])
        expect(mapRuns).toBe(14)
        expect(mappedEntries.toArray()).toMatchObject([
            [1, 4],
            [2, 3],
            [3, 1],
            [4, 2],
            [5, 0]
        ])
    })
})

describe('rxList metas', () => {
    test('run once on length', async () => {
        const list = new RxList<number>([1,2,3,4,5])

        let stop:any = once(() => {
            if (list.length() !== 5) {
                stop = undefined
                return true
            }
        })
        list.pop()
        expect(stop).toBeDefined()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(stop).toBe(undefined)

        stop = once(() => {
            if (list.length() !== 4) {
                stop = undefined
                return true
            }
        })
        list.pop()
        expect(stop).toBeDefined()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(list.length()).toBe(3)
        expect(stop).toBe(undefined)
    })
})
