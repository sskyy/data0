import {Atom, atom, autorun, computed, RxList} from "../src";
import {describe, expect, test} from "vitest";
import {once} from "../src/common";

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

    test('once with scheduler', async () => {
        const list = new RxList<{id:number, status:Atom<string>}>([])
        const pendingList = list.filter(item => item.status() === 'pending')
        const processingList = list.filter(item => item.status() === 'processing')

        const p1 = {id: 1, status: atom('pending')}
        list.push(p1)


        let stopped = false
        once(() => {
            if (pendingList.length() > 0) {
                Promise.resolve().then(() => pendingList.at(0)!.status('processing'))
            } else {
                if (processingList.length() ==0) {
                    stopped = true
                    return true
                }
            }
        }, (rerun) => {
            setTimeout(() => {
                rerun()
            }, 100)
        })

        expect(pendingList.length.raw).toBe(1)
        await wait(1)
        expect(pendingList.length.raw).toBe(0)
        expect(processingList.length.raw).toBe(1)
        expect(stopped).toBe(false)

        p1.status('done')
        expect(pendingList.length.raw).toBe(0)
        expect(processingList.length.raw).toBe(0)
        expect(stopped).toBe(false)

        await new Promise(resolve => setTimeout(resolve, 200))
        expect(stopped).toBe(true)

    })
})

