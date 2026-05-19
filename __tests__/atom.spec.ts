import {atom, isAtom} from "../src/atom";
import {autorun} from "../src/common";
import {Notifier} from "../src/notify";
import {beforeEach, describe, expect, test, vi} from "vitest";


describe('atom basic', () => {
    beforeEach(() => {
    })

    test('isAtom', () => {
        expect(isAtom(atom(1))).toBe(true)
        expect(isAtom(1)).toBe(false)
    })

    test('atom reads skip tracking outside reactive scopes', () => {
        const value = atom(1)
        const track = vi.spyOn(Notifier.instance, 'track')

        expect(value()).toBe(1)
        expect(`${value}`).toBe('1')
        expect(track).not.toHaveBeenCalled()

        let latest = 0
        const stop = autorun(() => {
            latest = value()
        }, true)
        expect(latest).toBe(1)
        expect(track).toHaveBeenCalled()

        stop()
        track.mockRestore()
    })

    test('primitive atom updates value and raw without proxy', () => {
        const value = atom('a')

        expect(value()).toBe('a')
        expect(value.raw).toBe('a')
        expect(`${value}`).toBe('a')

        value('b')

        expect(value()).toBe('b')
        expect(value.raw).toBe('b')
        expect(`${value}`).toBe('b')
        expect(isAtom(value)).toBe(true)
    })

    test('primitive atom tracks and triggers reactive readers', () => {
        const value = atom(1)
        const seen: number[] = []
        const stop = autorun(() => {
            seen.push(value())
        }, true)

        value(2)
        value(2)
        value(3)

        expect(seen).toEqual([1, 2, 3])
        stop()
    })

    test('primitive atom keeps call and primitive conversion behavior', () => {
        const numberValue = atom(1)
        const boolValue = atom(true)
        const nullValue = atom(null)

        expect(numberValue.call(null)).toBe(1)
        numberValue.call(null, 2)
        expect(numberValue()).toBe(2)
        expect(+numberValue).toBe(2)
        expect(`${boolValue}`).toBe('[object Boolean]')
        expect(`${nullValue}`).toBe('[object Null]')
    })

    test('object atom keeps proxy property access behavior', () => {
        const value = atom({count: 1})

        expect(value.count).toBe(1)
        value.count = 2
        expect(value.raw.count).toBe(2)
        expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    })

    test('atom with interceptor keeps proxy path', () => {
        const value = atom(1, (updater, handler) => {
            return [updater, {
                ...handler,
                get(target, key, receiver) {
                    if (key === 'custom') return 'intercepted'
                    return handler.get!(target, key, receiver)
                }
            }]
        }) as ReturnType<typeof atom> & { custom: string }

        expect(value.custom).toBe('intercepted')
        expect(value()).toBe(1)
    })
})
