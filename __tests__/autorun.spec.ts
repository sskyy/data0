import {atom, computed, autorun, setDefaultScheduleRecomputedAsLazy} from "../src";
import {describe, expect, test} from "vitest";

setDefaultScheduleRecomputedAsLazy(true)


describe('autorun', () => {
    test('with atomComputed', () => {
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
})