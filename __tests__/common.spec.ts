import {Atom, atom, autorun, computed, RxList, RxMap, RxSet, STATUS_CLEAN, STATUS_RECOMPUTING} from "../src";
import {describe, expect, test} from "vitest";
import {once, oncePromise, onChange} from "../src/common";
import { TriggerOpTypes } from "../src/operations";
function wait(time: number) {
    return new Promise(resolve => {
        setTimeout(resolve, time)
    })
}


describe('common utils', () => {
    test('autorun with atomComputed', () => {
        const atom1 = atom<any>(null)
        const computed1 = computed(function computed1()  {
            return atom1()
        })

        const history: any[] = []
        autorun(() => {
            history.push(computed1())
            // history.push(atom1())
        },true)

        expect(history).toMatchObject([null])
        atom1(1)
        expect(history).toMatchObject([null, 1])
    })

    test('autorun with uncontrolled child', () => {
        const atom1 = atom<any>(null)
        const history: any[] = []

        const outerAtom = atom(0)
        const innerStop: any[] = []
        autorun(({pauseCollectChild, resumeCollectChild}) => {
            outerAtom()
            pauseCollectChild()
            innerStop.push(autorun(function computed1({onCleanup})  {
                history.push(atom1())
            }, true))
            resumeCollectChild()
        },true)

        expect(history).toMatchObject([null])
        // 上一次的 inner autorun 不会被销毁，现在生成了2个了
        outerAtom(2)
        expect(history).toMatchObject([null, null])

        atom1(1)
        expect(history).toMatchObject([null, null, 1, 1])

        outerAtom(3)
        atom1(2)
        expect(history).toMatchObject([null, null, 1, 1, 1, 2,2,2])
        // 全部 stop
        innerStop.forEach(stop => stop())
        atom1(3)
        expect(history).toMatchObject([null, null, 1, 1, 1, 2,2,2])
    })

    test('autorun should not destroy length', () => {
        const list = new RxList<number>([])
        const history: number[] = []
        autorun(() => {
            history.push(list.length())
        },true)

        list.push(1)
        expect(history).toMatchObject([0, 1])
        list.push(2)
        expect(history).toMatchObject([0, 1, 2])
    })

    test('once with atom', () => {
        const atom1 = atom<number>(0)

        const onceRunsWithValue:number[] = []
        once(() => {
            onceRunsWithValue.push(atom1())
            if(atom1() > 5) {
                return true
            }
        },true)

        expect(onceRunsWithValue).toMatchObject([0])
        atom1(1)
        expect(onceRunsWithValue).toMatchObject([0, 1])
        atom1(2)
        expect(onceRunsWithValue).toMatchObject([0, 1, 2])
        atom1(6)
        expect(onceRunsWithValue).toMatchObject([0, 1, 2, 6])
        atom1(7)
        expect(onceRunsWithValue).toMatchObject([0, 1, 2, 6])
        atom(1)
        expect(onceRunsWithValue).toMatchObject([0, 1, 2, 6])
    })

    test('once has default scheduler', async () => {
        const list = new RxList<{id:number, status:Atom<string>}>([])
        const pendingList = list.filter(item => item.status() === 'pending')
        const processingList = list.filter(item => item.status() === 'processing')

        const p1 = {id: 1, status: atom('pending')}
        list.push(p1)


        let stopped = false
        once(() => {
            if (pendingList.length() > 0) {
                // 下一个 task 中触发变化。一定可以
                // Promise.resolve().then(() => pendingList.at(0)!.status('processing'))
                pendingList.at(0)!.status('processing')
            } else {
                if (processingList.length() ==0) {
                    stopped = true
                    return true
                }
            }
        })

        // expect(pendingList.length.raw).toBe(1)
        await wait(1)
        expect(pendingList.length.raw).toBe(0)
        expect(processingList.length.raw).toBe(1)
        expect(stopped).toBe(false)

        p1.status('done')
        expect(pendingList.length.raw).toBe(0)
        expect(processingList.length.raw).toBe(0)
        expect(stopped).toBe(false)

        await wait(100)
        expect(stopped).toBe(true)
    })

    test('oncePromise', async () => {
        const list = new RxList(async () => {
            await wait(100)
            return [1, 2, 3]
        })

        expect(list.status()).toBe(STATUS_RECOMPUTING)

        let onceRuns = 0
        await oncePromise(() => {
            onceRuns++
            return list.status() === STATUS_CLEAN
        })

        expect(onceRuns).toBe(2)
        expect(list.status()).toBe(STATUS_CLEAN)
    })

    test('onChange call on atom change', () => {
        const atom1 = atom(0)
        const history: any[] = []
        onChange(atom1, (triggerInfos) => {
            history.push(triggerInfos)
        })

        atom1(1)
        expect(history.length).toBe(1)
        expect(history[0]).toMatchObject([{type: TriggerOpTypes.ATOM, key: 'value', newValue: 1, oldValue: 0}])
        atom1(2)
        expect(history.length).toBe(2)
        expect(history[1]).toMatchObject([{type: TriggerOpTypes.ATOM, key: 'value', newValue: 2, oldValue: 1}])
    })

    test('onChange call on list change', () => {
        const list = new RxList<number>()
        const history: any[] = []
        onChange(list, (triggerInfos) => {
            history.push(triggerInfos)
        })

        list.push(1)
        expect(history.length).toBe(1)
        expect(history[0][0]).toMatchObject({type: TriggerOpTypes.METHOD, method: 'splice'})

        list.push(2)
        expect(history.length).toBe(2)
        expect(history[1][0]).toMatchObject({type: TriggerOpTypes.METHOD, method: 'splice'})
    })

    test('onChange call on map change', () => {
        const map = new RxMap<number, number>()
        const history: any[] = []
        onChange(map, (triggerInfos) => {
            history.push(triggerInfos)
        })

        map.set(1, 1)
        expect(history.length).toBe(1)
        expect(history[0][0]).toMatchObject({type: TriggerOpTypes.METHOD, method: 'set'})

        map.set(2, 2)
        expect(history.length).toBe(2)
        expect(history[1][0]).toMatchObject({type: TriggerOpTypes.METHOD, method: 'set'})
    })

    test('onChange call on set change', () => {
        const set = new RxSet<number>([])
        const history: any[] = []
        onChange(set, (triggerInfos) => {
            history.push(triggerInfos)
        })

        set.add(1)
        expect(history.length).toBe(1)
        expect(history[0][0]).toMatchObject({type: TriggerOpTypes.METHOD, method: 'add'})

        set.add(2)
        expect(history.length).toBe(2)
        expect(history[1][0]).toMatchObject({type: TriggerOpTypes.METHOD, method: 'add'})   
    })
    
})

