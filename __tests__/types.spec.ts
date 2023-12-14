import {atom} from "../src/atom";
import {describe, test, expectTypeOf} from "vitest";

type ComplexObject = {
    key: string,
    value: number
}


describe("types test", () => {
    test('atom type', () => {
        const a = atom({} as ComplexObject)
        expectTypeOf(a()).toEqualTypeOf<ComplexObject>()
        expectTypeOf(a().key).toEqualTypeOf<string>()

        const b = atom<ComplexObject>({key: '1', value: 1})
        expectTypeOf(b()).toEqualTypeOf<ComplexObject>()
        expectTypeOf(b().key).toEqualTypeOf<string>()
        expectTypeOf(b().value).toEqualTypeOf<number>()
    })
})



