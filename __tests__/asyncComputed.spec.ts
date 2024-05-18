import {RxList} from "../src/RxList.js";
import {describe, expect, test} from "vitest";
import {atom} from "../src/atom.js";
import {atomComputed, autorun, Computed, ReactiveEffect, TrackOpTypes} from "../src/index.js";

describe('RxList', () => {
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
        const list = new RxList<number>(function*({ asyncStatus }): Generator<any, number[], number[]>{
            asyncStatus('before fetch')
            yield wait(10)
            asyncStatus('fetching')
            const data = yield fetchData(offset(), length())
            asyncStatus('fetch done')
            return data
        })
        const status: any[] = []
        autorun(() => {
            status.push(list.asyncStatus!())
        })

        expect(list.data).toMatchObject([])

        expect(list.asyncStatus!()).toBeTruthy()

        await wait(10)
        await fetchPromise
        await wait(10)
        expect(list.asyncStatus!()).toBe(false)

        expect(list.data).toMatchObject([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(status).toMatchObject(['before fetch', 'fetching', 'fetch done', false])

        offset(10)
        await wait(10)
        await fetchPromise
        await wait(10)
        expect(list.data).toMatchObject([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])

        length(5)
        await wait(10)
        await fetchPromise
        await wait(10)
        expect(list.data).toMatchObject([10, 11, 12, 13, 14])

    })

    test('async recompute should stop when new effect trigger', async () => {
        const runTrigger = atom(0)
        const data = atomComputed(function*() {
            // TODO 构造一个异步的计算
            const newNum = runTrigger()
            yield wait(20)
            return newNum
        })
        expect(ReactiveEffect.activeScopes.length).toBe(0)

        const nums: number[] = []
        autorun(() => {
            nums.push(data())
        })
        runTrigger(1)
        runTrigger(2)
        runTrigger(3)
        expect(ReactiveEffect.activeScopes.length).toBe(0)
        await wait(30)
        expect(ReactiveEffect.activeScopes.length).toBe(0)

        expect(data()).toBe(3)
        expect(nums).toMatchObject([null,3])
    })

    test('async patch', async () => {
        const length = atom(10)
        const list = new RxList<number>(
            function*(this:Computed,{ asyncStatus }): Generator<any, number[], number[]>{
                this.manualTrack(length, TrackOpTypes.ATOM, 'value')
                yield wait(10)
                const data = yield fetchData(0, length())
                return data
            },
            function*(this: RxList<number>,{ asyncStatus }, triggerInfos): Generator<any, any, number[]>{
                for(let triggerInfo of triggerInfos) {

                    const {oldValue, newValue} = triggerInfo as {oldValue:number, newValue:number}
                    const newData = yield fetchData(oldValue, newValue-oldValue)
                    this.data.push(...newData)
                }
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


    })

})