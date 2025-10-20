import {computed} from "../src/computed";
import {Atom, atom, isAtom} from "../src/atom";
import {describe, test, expectTypeOf, assertType} from "vitest";

type ComplexObject = {
    key: string,
    value: number
}

describe("atom types test", () => {
    test('atom type', () => {
        const a = atom({} as ComplexObject)
        expectTypeOf(a()).toEqualTypeOf<ComplexObject>()
        expectTypeOf(a().key).toEqualTypeOf<string>()

        const b = atom<ComplexObject>({key: '1', value: 1})
        expectTypeOf(b()).toEqualTypeOf<ComplexObject>()
        expectTypeOf(b().key).toEqualTypeOf<string>()
        expectTypeOf(b().value).toEqualTypeOf<number>()


        const c = atom<ComplexObject>(null)
        expectTypeOf(c()).toEqualTypeOf<ComplexObject|null>()

        const d = atom(1)
        expectTypeOf(d()).toEqualTypeOf<number>()

        const e = atom(true)
        expectTypeOf(e()).toEqualTypeOf<boolean>()
    })

    test('atom base types', () => {
        const num = atom(1)
        expectTypeOf(num).toExtend<Atom<number>>()
        expectTypeOf(num()).toEqualTypeOf<number>()
        expectTypeOf(num.raw).toEqualTypeOf<number>()

        const str = atom('str')
        expectTypeOf(str).toExtend<Atom<string>>()
        expectTypeOf(str()).toEqualTypeOf<string>()
        expectTypeOf(str.raw).toEqualTypeOf<string>()

        const bool = atom(true)
        expectTypeOf(bool).toExtend<Atom<boolean>>()
        expectTypeOf(bool()).toEqualTypeOf<boolean>()
        expectTypeOf(bool.raw).toEqualTypeOf<boolean>()

        const obj = atom({key: '1', value: 1})
        expectTypeOf(obj).toEqualTypeOf<Atom<ComplexObject>>()
        expectTypeOf(obj()).toEqualTypeOf<ComplexObject>()
        expectTypeOf(obj.raw).toEqualTypeOf<ComplexObject>()

        const arr = atom(['a', 'b'])
        expectTypeOf(arr).toEqualTypeOf<Atom<string[]>>()
        expectTypeOf(arr()).toEqualTypeOf<string[]>()
        expectTypeOf(arr.raw).toEqualTypeOf<string[]>()

        const dom = atom({} as any as HTMLElement)
        expectTypeOf(dom).toEqualTypeOf<Atom<HTMLElement>>()
        expectTypeOf(dom()).toEqualTypeOf<HTMLElement>()
        expectTypeOf(dom.raw).toEqualTypeOf<HTMLElement>()
    })

    test('atom null and undefined types', () => {
        const numNull = atom<number>(null)
        expectTypeOf(numNull).toEqualTypeOf<Atom<number | null>>()
        expectTypeOf(numNull()).toEqualTypeOf<number | null>()
        expectTypeOf(numNull.raw).toEqualTypeOf<number | null>()
        const numUndefined = atom<number>()
        expectTypeOf(numUndefined).toEqualTypeOf<Atom<number | undefined>>()
        expectTypeOf(numUndefined()).toEqualTypeOf<number | undefined>()
        expectTypeOf(numUndefined.raw).toEqualTypeOf<number | undefined>()

        const strNull = atom<string>(null)
        expectTypeOf(strNull).toEqualTypeOf<Atom<string | null>>()
        expectTypeOf(strNull()).toEqualTypeOf<string | null>()
        expectTypeOf(strNull.raw).toEqualTypeOf<string | null>()
        const strUndefined = atom<string>()
        expectTypeOf(strUndefined).toEqualTypeOf<Atom<string | undefined>>()
        expectTypeOf(strUndefined()).toEqualTypeOf<string | undefined>()
        expectTypeOf(strUndefined.raw).toEqualTypeOf<string | undefined>()

        const boolNull = atom<boolean>(null)
        expectTypeOf(boolNull).toEqualTypeOf<Atom<boolean | null>>()
        expectTypeOf(boolNull()).toEqualTypeOf<boolean | null>()
        expectTypeOf(boolNull.raw).toEqualTypeOf<boolean | null>()
        const boolUndefined = atom<boolean>()
        expectTypeOf(boolUndefined).toEqualTypeOf<Atom<boolean | undefined>>()
        expectTypeOf(boolUndefined()).toEqualTypeOf<boolean | undefined>()
        expectTypeOf(boolUndefined.raw).toEqualTypeOf<boolean | undefined>()

        const objNull = atom<ComplexObject>(null)
        expectTypeOf(objNull).toEqualTypeOf<Atom<ComplexObject | null>>()
        expectTypeOf(objNull()).toEqualTypeOf<ComplexObject | null>()
        expectTypeOf(objNull.raw).toEqualTypeOf<ComplexObject | null>()
        const objUndefined = atom<ComplexObject>()
        expectTypeOf(objUndefined).toEqualTypeOf<Atom<ComplexObject | undefined>>()
        expectTypeOf(objUndefined()).toEqualTypeOf<ComplexObject | undefined>()
        expectTypeOf(objUndefined.raw).toEqualTypeOf<ComplexObject | undefined>()

        const arrNull = atom<string[]>(null)
        expectTypeOf(arrNull).toEqualTypeOf<Atom<string[] | null>>()
        expectTypeOf(arrNull()).toEqualTypeOf<string[] | null>()
        expectTypeOf(arrNull.raw).toEqualTypeOf<string[] | null>()
        const arrUndefined = atom<string[]>()
        expectTypeOf(arrUndefined).toEqualTypeOf<Atom<string[] | undefined>>()
        expectTypeOf(arrUndefined()).toEqualTypeOf<string[] | undefined>()
        expectTypeOf(arrUndefined.raw).toEqualTypeOf<string[] | undefined>()

        const domNull = atom<HTMLElement>(null)
        expectTypeOf(domNull).toEqualTypeOf<Atom<HTMLElement | null>>()
        expectTypeOf(domNull()).toEqualTypeOf<HTMLElement | null>()
        expectTypeOf(domNull.raw).toEqualTypeOf<HTMLElement | null>()
        const domUndefined = atom<HTMLElement>()
        expectTypeOf(domUndefined).toEqualTypeOf<Atom<HTMLElement | undefined>>()
        expectTypeOf(domUndefined()).toEqualTypeOf<HTMLElement | undefined>()
        expectTypeOf(domUndefined.raw).toEqualTypeOf<HTMLElement | undefined>()
    })

    test('atom any type', () => {
        const a = atom<any>(null)
        expectTypeOf(a()).toEqualTypeOf<any>()
        assertType<Atom<any>>(a)
        assertType<true>(a.__v_isAtom)
    })

    test('isAtom type inference', () => {
        function testFn(input: Atom<number> | number) {
            if (isAtom(input)) {
                expectTypeOf(input).toEqualTypeOf<Atom<number>>()
                expectTypeOf(input()).toEqualTypeOf<number>()
                expectTypeOf(input.raw).toEqualTypeOf<number>()
            } else {
                expectTypeOf(input).toEqualTypeOf<number>()
            }
        }
        testFn(atom(1))
        testFn(1)
    })

    test('flexible', () => {
        type AtomizablePrimitiveType = string | number | boolean
        type FlexibleValue<T> = T extends AtomizablePrimitiveType ? Atom<T> | T : T
        type FlexibleProps<T> = {
            [K in keyof T]: FlexibleValue<T[K]>
        }

        type MyProps = {
            bool: boolean
            num: number
            str: string
        }
        type FlexibleMyProps = FlexibleProps<MyProps>
        const flexible = {} as FlexibleMyProps;
        expectTypeOf(flexible.bool).toEqualTypeOf<boolean | Atom<boolean>>()
        flexible.bool = atom(true)
        flexible.bool = false
    })

    test('atomized', () => {
        type AtomizablePrimitiveType = string | number | boolean
        type AtomizedValue<T> = T extends AtomizablePrimitiveType ? Atom<T> : T
        type AtomizedProps<T> = {
            [K in keyof T]: AtomizedValue<T[K]>
        }

        type MyProps = {
            bool: boolean
            num: number
            str: string
        }
        type AtomizedMyProps = AtomizedProps<MyProps>
        const atomized = {} as AtomizedMyProps;
        expectTypeOf(atomized.bool).toEqualTypeOf<Atom<boolean>>()
    })
})

describe('computed types test', () => {
    test('infer computed type from getter returns', () => {
        const num = computed(() => 1)
        expectTypeOf(num).toExtend<Atom<number>>()
        expectTypeOf(num()).toEqualTypeOf<number>()

        const str = computed(() => 'str')
        expectTypeOf(str).toExtend<Atom<string>>()
        expectTypeOf(str()).toEqualTypeOf<string>()

        const bool = computed(() => true)
        expectTypeOf(bool).toExtend<Atom<boolean>>()
        expectTypeOf(bool()).toEqualTypeOf<boolean>()
    })
})
