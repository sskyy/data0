import {createSelection, RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {computed} from "../src/index.js";
import {autorun} from "../src/autorun.js";
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
        expect(list2.toArray()).toMatchObject([0,2,6])
        expect(mapRuns).toBe(3)

        // splice 以后仍然保持正确
        list.splice(1,1)
        expect(list.atomIndexes!.map(i => i())).toMatchObject([0,1])
        expect(list2.toArray()).toMatchObject([0,6])
        expect(mapRuns).toBe(3)

        // splice 添加元素
        list.splice(1,0, 3)
        expect(list.atomIndexes!.map(i => i())).toMatchObject([0,1, 2])
        expect(list2.toArray()).toMatchObject([0,3,6])
        expect(mapRuns).toBe(4)

        // 通过 set 修改元素
        list.set(1, 4)
        expect(list2.toArray()).toMatchObject([0,4,6])
        expect(mapRuns).toBe(5)
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

        expect(reducedList.toArray()).toMatchObject([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4}
        ])

        list.push({id:5, score: 5})
        expect(reducedList.toArray()).toMatchObject([
            {id:1, score: 1},
            {id:2, score: 2},
            {id:3, score: 3},
            {id:4, score: 4},
            {id:5, score: 5},
        ])

        list.push({id:1, score: 6})
        expect(reducedList.toArray()).toMatchObject([
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
        })

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
        })

        let isAllSelected2 = false
        autorun(function(){
            isAllSelected2 = allSelected()
        })

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