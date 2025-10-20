import {atom, isAtom} from "../src/atom";
import {beforeEach, describe, expect, test} from "vitest";


describe('atom basic', () => {
    beforeEach(() => {
    })

    test('isAtom', () => {
        expect(isAtom(atom(1))).toBe(true)
        expect(isAtom(1)).toBe(false)
    })
})
