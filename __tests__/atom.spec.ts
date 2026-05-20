import {atom, isAtom} from "../src/atom";
import {autorun} from "../src/common";
import {Notifier} from "../src/notify";
import {Computed} from "../src/computed";
import {TrackOpTypes} from "../src/operations";
import {
    batch,
    disableData0RetainedObjectDiagnostics,
    enableData0RetainedObjectDiagnostics,
    getData0RetainedObjectDiagnosticsSnapshot
} from "../src";
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
        const track = vi.spyOn(Notifier.instance, 'trackPrimitiveAtomValue')

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

    test('primitive atom stores value dep without target map entry', () => {
        const value = atom(1)
        const seen: number[] = []
        const stop = autorun(() => {
            seen.push(value())
        }, true)

        expect(seen).toEqual([1])
        expect(Notifier.instance.targetMap.has(value)).toBe(false)
        expect(Notifier.instance.getDepEffects(value)?.size).toBe(1)

        value(2)
        expect(seen).toEqual([1, 2])

        stop()
        expect(Notifier.instance.getDepEffects(value)?.size).toBe(0)
        value(3)
        expect(seen).toEqual([1, 2])
    })

    test('primitive atom dep stays compact for single subscriber and supports overflow', () => {
        const value = atom(1)
        const firstSeen: number[] = []
        const secondSeen: number[] = []
        const stopFirst = autorun(() => {
            firstSeen.push(value())
        }, true)

        const dep = Notifier.instance.getPrimitiveAtomDep(value)
        expect(dep).toBeTruthy()
        expect(dep).not.toBeInstanceOf(Set)
        expect([...dep!]).toHaveLength(1)

        const stopSecond = autorun(() => {
            secondSeen.push(value())
        }, true)
        expect([...dep!]).toHaveLength(2)

        value(2)
        expect(firstSeen).toEqual([1, 2])
        expect(secondSeen).toEqual([1, 2])

        stopSecond()
        expect([...dep!]).toHaveLength(1)
        value(3)
        expect(firstSeen).toEqual([1, 2, 3])
        expect(secondSeen).toEqual([1, 2])

        stopFirst()
        expect([...dep!]).toHaveLength(0)
    })

    test('retained diagnostics count primitive atom deps and effects', () => {
        enableData0RetainedObjectDiagnostics({reset: true})
        try {
            const value = atom(1)
            const stop = autorun(() => {
                value()
            }, true)

            const afterTrack = getData0RetainedObjectDiagnosticsSnapshot()
            expect(afterTrack.enabled).toBe(true)
            expect(afterTrack.reactiveEffects.totalActive).toBe(1)
            expect(afterTrack.primitiveAtomDeps.activeDeps).toBe(1)
            expect(afterTrack.primitiveAtomDeps.activeEffects).toBe(1)

            stop()
            const afterStop = getData0RetainedObjectDiagnosticsSnapshot()
            expect(afterStop.reactiveEffects.totalActive).toBe(0)
            expect(afterStop.primitiveAtomDeps.activeDeps).toBe(0)
            expect(afterStop.primitiveAtomDeps.activeEffects).toBe(0)
        } finally {
            disableData0RetainedObjectDiagnostics()
        }
    })

    test('primitive atom fast dep supports manual track and batched triggers', () => {
        const value = atom(1)
        const seen: number[] = []
        const effect = new Computed(function(this: Computed) {
            this.manualTrack(value, TrackOpTypes.ATOM, 'value')
            seen.push(value.raw)
        }, undefined, true)

        effect.run([], true)
        expect(seen).toEqual([1])
        expect(Notifier.instance.targetMap.has(value)).toBe(false)

        batch(() => {
            value(2)
            value(3)
        })
        expect(seen).toEqual([1, 3])

        effect.destroy()
        value(4)
        expect(seen).toEqual([1, 3])
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
