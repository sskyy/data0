import {atom, autorun, computed} from "../src";
import {describe, expect, test} from "vitest";
import {once} from "../src/common";


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
        })

        expect(history).toMatchObject([null])
        atom1(1)
        expect(history).toMatchObject([null, 1])

    })

    test('once with atom', () => {
        const atom1 = atom<number>(0)

        const onceRunsWithValue:number[] = []
        once(() => {
            onceRunsWithValue.push(atom1())
            if(atom1() > 5) {
                return true
            }
        })

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
        const atom1 = atom<number>(0)
        const onceRunsWithValue:number[] = []
        
        once(() => {
            onceRunsWithValue.push(atom1())
            if(atom1() > 5) {
                return true
            }
        }, (rerun) => {
            setTimeout(() => {
                rerun()
            }, 100)
        })

        expect(onceRunsWithValue).toMatchObject([0])
        atom1(7)
        expect(onceRunsWithValue).toMatchObject([0])
        await new Promise(resolve => setTimeout(resolve, 200))
        expect(onceRunsWithValue).toMatchObject([0, 7])
    })
})

