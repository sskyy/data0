import {RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {atom} from "../src/atom.js";
import {
    atomComputed,
    autorun,
    Computed,
    ReactiveEffect,
    setDefaultScheduleRecomputedAsLazy,
    TrackOpTypes
} from "../src/index.js";


setDefaultScheduleRecomputedAsLazy(true)


describe('async computed', () => {
    let fetchPromise: any
    const fetchData = (offset:number, legnth:number): Promise<number[]> => {
        const data = Array(100).fill(0).map((_, index) => index)
        fetchPromise = new Promise((resolve) => {
            return setTimeout(() => {
                resolve(data.slice(offset, offset + legnth))
            }, 50)
        })
        return fetchPromise
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

        expect(list.data).toMatchObject([])

        expect(list.asyncStatus!()).toBeTruthy()

        await wait(100)
        await list.effectPromise
        await wait(10)
        expect(list.asyncStatus!()).toBe(false)
        expect(innerRuns).toBe(1)

        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(status).toMatchObject(['before fetch', 'fetching', 'fetch done', false])
        offset(10)
        await wait(100)
        await list.effectPromise
        await wait(50)
        expect(list.data).toMatchObject([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
        expect(innerRuns).toBe(2)


        length(5)
        await wait(100)
        await list.effectPromise
        await wait(10)
        expect(list.data).toMatchObject([10, 11, 12, 13, 14])
        expect(innerRuns).toBe(3)

        offset(11)
        length(6)
        await wait(100)
        await fetchPromise
        await wait(10)
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

        expect(list.data).toMatchObject([])
        expect(list.asyncStatus!()).toBeTruthy()

        await wait(100)
        await fetchPromise
        await wait(10)
        expect(list.asyncStatus!()).toBe(false)
        expect(innerRuns).toBe(1)

        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        offset(10)
        await wait(100)
        await list.effectPromise
        await wait(50)
        expect(list.data).toMatchObject([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
        expect(innerRuns).toBe(2)


        length(5)
        await wait(100)
        await fetchPromise
        await wait(10)
        expect(list.data).toMatchObject([10, 11, 12, 13, 14])
        expect(innerRuns).toBe(3)

        offset(11)
        length(6)
        await wait(100)
        await fetchPromise
        await wait(10)
        expect(list.data).toMatchObject([11, 12, 13, 14, 15, 16])
        // 计算是在 next micro task 中的，所以应该是被合并了
        expect(innerRuns).toBe(4)

    })

    test('async recompute should stop when new effect trigger', async () => {
        const runTrigger = atom(0)
        let innerRuns = 0
        let inRecompute = false
        const data = atomComputed(function*() {
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
        await wait(1)
        expect(innerRuns).toBe(1)

        runTrigger(1)
        await wait(1)
        expect(innerRuns).toBe(2)

        expect(inRecompute).toBe(true)
        runTrigger(2)
        await wait(1)
        expect(innerRuns).toBe(3)

        expect(inRecompute).toBe(true)
        runTrigger(3)
        await wait(10)
        expect(innerRuns).toBe(4)

        expect(ReactiveEffect.activeScopes.length).toBe(0)
        await wait(100)
        expect(ReactiveEffect.activeScopes.length).toBe(0)

        expect(data()).toBe(3)
        expect(nums).toMatchObject([null,3])
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
        await wait(11)
        await fetchPromise
        await wait(11)
        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        length(20)
        length(30)
        await wait(200)
        expect(list.data).toMatchObject(Array(30).fill(0).map((_, index) => index))
        // 应该只拍一次，因为 asyncComputed 默认泡在 next micro task 中
        expect(patchRuns).toBe(1)
    })

    test('async patch interrupted with more reactive trigger', async () => {
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
        await wait(11)
        await fetchPromise
        await wait(11)
        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        length(20)
        await wait(1)
        expect(patchRuns).toBe(1)

        expect(inPatch).toBe(true)
        length(30)
        await list.effectPromise
        expect(patchRuns).toBe(2)

        await wait(200)
        expect(list.data).toMatchObject(Array(30).fill(0).map((_, index) => index))
    })

    test('async patch interrupted with more dirty deps trigger', async () => {
        const length = atom(10)
        const length2 = atomComputed(() => length())
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
        await wait(11)
        await fetchPromise
        await wait(11)
        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        length(20)
        await wait(1)
        expect(patchRuns).toBe(1)

        expect(inPatch).toBe(true)
        length(30)
        await wait(10)
        await list.effectPromise
        await wait(100)

        expect(patchRuns).toBe(2)

        await wait(200)
        expect(list.data).toMatchObject(Array(30).fill(0).map((_, index) => index))
    })

})