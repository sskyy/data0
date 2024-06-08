import {RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {atom} from "../src/atom.js";
import {
    computed,
    autorun,
    Computed,
    ReactiveEffect,
    setDefaultScheduleRecomputedAsLazy,
    TrackOpTypes
} from "../src/index.js";


setDefaultScheduleRecomputedAsLazy(true)


describe('async computed', () => {
    const fetchData = (offset:number, legnth:number): Promise<number[]> => {
        const data = Array(100).fill(0).map((_, index) => index)
        return new Promise((resolve) => {
            return setTimeout(() => {
                resolve(data.slice(offset, offset + legnth))
            }, 50)
        })
    }

    const wait = (time: number) => {
        return new Promise(resolve => {
            setTimeout(resolve, time)
        })
    }

    test('use generator getter', async () => {
        const offset = atom(0)
        const length = atom(10)
        let innerRuns = 0
        const list = new RxList<number>(function*({ asyncStatus }): Generator<any, number[], number[]>{
            asyncStatus('before fetch')
            yield wait(10)
            asyncStatus('fetching')
            const data = yield fetchData(offset(), length())
            asyncStatus('fetch done')
            innerRuns++
            return data
        })
        const status: any[] = []
        autorun(() => {
            status.push(list.asyncStatus!())
        })

        // 通过 toArray 触发计算
        expect(list.toArray()).toMatchObject([])
        expect(list.asyncStatus!()).toBeTruthy()
        await list.cleanPromise
        expect(list.asyncStatus!()).toBe(false)
        expect(innerRuns).toBe(1)

        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(status).toMatchObject(['before fetch', 'fetching', 'fetch done', false])
        offset(10)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
        expect(innerRuns).toBe(2)


        length(5)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject([10, 11, 12, 13, 14])
        expect(innerRuns).toBe(3)

        offset(11)
        length(6)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject([11, 12, 13, 14, 15, 16])
        // 计算是在 next micro task 中的，所以应该是被合并了
        expect(innerRuns).toBe(4)

    })

    test('use async getter', async () => {
        const offset = atom(0)
        const length = atom(10)
        let innerRuns = 0
        const list = new RxList<number>(async function({ asyncStatus }): Promise<number[]>{
            const offset1 = offset()
            const length1 = length()
            await wait(10)
            innerRuns++
            return fetchData(offset1, length1)
        })
        const status: any[] = []
        autorun(() => {
            status.push(list.asyncStatus!())
        })

        expect(list.toArray()).toMatchObject([])
        expect(list.asyncStatus!()).toBeTruthy()

        await list.cleanPromise
        expect(list.asyncStatus!()).toBe(false)
        expect(innerRuns).toBe(1)

        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        offset(10)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
        expect(innerRuns).toBe(2)


        length(5)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject([10, 11, 12, 13, 14])
        expect(innerRuns).toBe(3)

        offset(11)
        length(6)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject([11, 12, 13, 14, 15, 16])
        // 计算是在 next micro task 中的，所以应该是被合并了
        expect(innerRuns).toBe(4)

    })

    test('async patch', async () => {
        const length = atom(10)
        let patchRuns = 0
        const list = new RxList<number>(
            function*(this:Computed,{  }): Generator<any, number[], number[]>{
                this.manualTrack(length, TrackOpTypes.ATOM, 'value')
                yield wait(10)
                return yield fetchData(0, length())
            },
            function*(this: RxList<number>,{  }, triggerInfos): Generator<any, any, number[]>{
                for(let triggerInfo of triggerInfos) {
                    const {oldValue, newValue} = triggerInfo as {oldValue:number, newValue:number}
                    const newData = yield fetchData(oldValue, newValue-oldValue)
                    this.data.push(...newData)
                }
                patchRuns++
            }
        )
        list.toArray()
        await list.cleanPromise
        expect(list.toArray()).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        length(20)
        length(30)
        list.toArray()
        await list.cleanPromise
        expect(list.data).toMatchObject(Array(30).fill(0).map((_, index) => index))
        // 应该只拍一次，因为 asyncComputed 默认泡在 next micro task 中
        expect(patchRuns).toBe(1)
    })

    test('async recompute should stop when new dep trigger', async () => {
        const runTrigger = atom(0)
        let innerRuns = 0
        let inRecompute = false
        const data = computed<number>(function*() {
            inRecompute = true
            const newNum = runTrigger()
            innerRuns++
            yield wait(100)
            inRecompute = false
            return newNum
        })
        expect(ReactiveEffect.activeScopes.length).toBe(0)

        const nums: number[] = []
        autorun(() => {
            nums.push(data())
        })
        expect(innerRuns).toBe(1)

        runTrigger(1)
        expect(innerRuns).toBe(2)

        expect(inRecompute).toBe(true)
        runTrigger(2)
        expect(innerRuns).toBe(3)

        expect(inRecompute).toBe(true)
        runTrigger(3)
        expect(innerRuns).toBe(4)

        expect(ReactiveEffect.activeScopes.length).toBe(0)
        await wait(100)
        expect(ReactiveEffect.activeScopes.length).toBe(0)

        expect(data()).toBe(3)
        expect(nums).toMatchObject([null,3])
    })




    test('async patch interrupted when running first full computation', async () => {
        const length = atom(10)
        let patchRuns = 0
        let inFullComputation = false
        const list = new RxList<number>(
            function*(this:Computed,{  }): Generator<any, number[], number[]>{
                inFullComputation = true
                this.manualTrack(length, TrackOpTypes.ATOM, 'value')
                yield wait(10)
                const result= yield fetchData(0, length())
                inFullComputation = false
                return result
            },
            function*(this: RxList<number>,{  }, triggerInfos): Generator<any, any, number[]>{
                inFullComputation = false
                patchRuns++
                for(let triggerInfo of triggerInfos) {
                    const {oldValue, newValue} = triggerInfo as {oldValue:number, newValue:number}
                    yield wait(10)
                    const newData = yield fetchData(oldValue, newValue-oldValue)
                    this.data.push(...newData)
                }
            }
        )
        await wait(1)
        // 仍然是空的
        expect(list.toArray()).toMatchObject([])
        expect(inFullComputation).toBe(true)
        // 还没算完就打断了
        length(20)
        expect(patchRuns).toBe(0)
        expect(inFullComputation).toBe(true)

        await list.cleanPromise
        expect(inFullComputation).toBe(false)
        expect(patchRuns).toBe(0)
        expect(list.data).toMatchObject(Array(20).fill(0).map((_, index) => index))
    })

    test('async patch interrupted when applying patch with more reactive dep trigger', async () => {
        const length = atom(10)
        let patchRuns = 0
        let inPatch = false
        const list = new RxList<number>(
            function*(this:Computed,{  }): Generator<any, number[], number[]>{
                this.manualTrack(length, TrackOpTypes.ATOM, 'value')
                yield wait(10)
                return yield fetchData(0, length())
            },
            function*(this: RxList<number>,{  }, triggerInfos): Generator<any, any, number[]>{
                inPatch = true
                patchRuns++
                for(let triggerInfo of triggerInfos) {
                    const {oldValue, newValue} = triggerInfo as {oldValue:number, newValue:number}
                    yield wait(10)
                    const newData = yield fetchData(oldValue, newValue-oldValue)
                    this.data.push(...newData)
                }
                inPatch = false

            }
        )
        list.toArray()
        await list.cleanPromise
        expect(list.toArray()).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        length(20)
        await wait(1)
        expect(patchRuns).toBe(1)
        expect(inPatch).toBe(true)
        length(30)
        await list.cleanPromise
        expect(patchRuns).toBe(2)

        expect(list.data).toMatchObject(Array(30).fill(0).map((_, index) => index))
    })

    test('async patch interrupted when applying patch with more computed dep trigger', async () => {
        const length = atom(10)
        const length2 = computed<number>(() => length())
        let patchRuns = 0
        let inPatch = false
        const list = new RxList<number>(
            function*(this:Computed,{  }): Generator<any, number[], number[]>{
                this.manualTrack(length2, TrackOpTypes.ATOM, 'value')
                yield wait(10)
                return yield fetchData(0, length2())
            },
            function*(this: RxList<number>,{  }, triggerInfos): Generator<any, any, number[]>{
                inPatch = true
                patchRuns++
                for(let triggerInfo of triggerInfos) {
                    const {oldValue, newValue} = triggerInfo as {oldValue:number, newValue:number}
                    yield wait(10)
                    const newData = yield fetchData(oldValue, newValue-oldValue)
                    this.data.push(...newData)
                }
                inPatch = false
            }
        )

        list.toArray()
        await list.cleanPromise
        expect(list.toArray()).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        length(20)
        await wait(1)
        expect(patchRuns).toBe(1)
        expect(inPatch).toBe(true)
        length(30)
        await list.cleanPromise

        expect(patchRuns).toBe(2)

        expect(list.data).toMatchObject(Array(30).fill(0).map((_, index) => index))
    })

})