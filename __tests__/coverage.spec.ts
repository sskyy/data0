import {describe, expect, test, vi} from "vitest";
import {AsyncRxSlice} from "../src/AsyncRxSlice";
import {atom} from "../src/atom";
import {onChange} from "../src/common";
import {destroyComputed} from "../src/computed";
import {Computed, computed, getComputedGetter, isComputed, recompute, scheduleNextTick} from "../src/computed";
import {
    createDebug,
    createDebugWithName,
    createName,
    debug,
    getDebugName,
    isDebugTarget,
    onTrack,
    onTrigger,
    setDebugName
} from "../src/debug";
import {LinkedList} from "../src/LinkedList";
import {ManualCleanup} from "../src/manualCleanup";
import {ITERATE_KEY, ITERATE_KEY_KEY_ONLY, Notifier} from "../src/notify";
import {TrackOpTypes, TriggerOpTypes} from "../src/operations";
import {ReactiveEffect} from "../src/reactiveEffect";
import {RxList} from "../src/RxList";
import {RxMap} from "../src/RxMap";
import {RxSet} from "../src/RxSet";
import {RxTime} from "../src/RxTime";
import {isData0RetainedObjectDiagnosticsEnabled} from "../src/retainedDiagnostics";
import {
    assert,
    camelize,
    capitalize,
    def,
    extend,
    getStackTrace,
    hasChanged,
    hasOwn,
    hyphenate,
    invokeArrayFns,
    isArray,
    isArrayMethod,
    isAsync,
    isBuiltInDirective,
    isDate,
    isFunction,
    isIntegerKey,
    isIntegerKeyQuick,
    isMap,
    isModelListener,
    isObject,
    isOn,
    isPlainObject,
    isPromise,
    isReactivableType,
    isRegExp,
    isReservedProp,
    isSet,
    isString,
    isStringOrNumber,
    isSymbol,
    looseToNumber,
    makeMap,
    nextTick,
    NO,
    remove,
    replace,
    toHandlerKey,
    toNumber,
    toRawType,
    toTypeString,
    uuid,
    warn
} from "../src/util";

function wait(time: number) {
    return new Promise(resolve => setTimeout(resolve, time))
}

describe('coverage helpers for public utilities', () => {
    test('util predicates and string helpers', async () => {
        const lookup = makeMap('foo,bar', true)
        expect(lookup('FOO')).toBe(true)
        expect(NO()).toBe(false)
        expect(isOn('onClick')).toBe(true)
        expect(isOn('once')).toBe(false)
        expect(isModelListener('onUpdate:value')).toBe(true)
        expect(extend({a: 1}, {b: 2})).toMatchObject({a: 1, b: 2})

        const items = [1, 2, 3]
        remove(items, 2)
        remove(items, 4)
        expect(items).toEqual([1, 3])

        expect(isArrayMethod('map')).toBe(true)
        expect(hasOwn({a: 1}, 'a')).toBe(true)
        expect(isArray([])).toBe(true)
        expect(isMap(new Map())).toBe(true)
        expect(isSet(new Set())).toBe(true)
        expect(isDate(new Date())).toBe(true)
        expect(isRegExp(/x/)).toBe(true)
        expect(isFunction(() => undefined)).toBe(true)
        expect(isString('x')).toBe(true)
        expect(isSymbol(Symbol('x'))).toBe(true)
        expect(isObject({})).toBe(true)
        expect(isObject(null)).toBe(false)
        expect(isPromise(Promise.resolve())).toBe(true)
        expect(toTypeString(new Map())).toBe('[object Map]')
        expect(toRawType(new Set())).toBe('Set')
        expect(isPlainObject({})).toBe(true)
        expect(isIntegerKeyQuick('9')).toBe(true)
        expect(isIntegerKey('12')).toBe(true)
        expect(isIntegerKey('-1')).toBe(false)
        expect(isReservedProp('key')).toBe(true)
        expect(isBuiltInDirective('model')).toBe(true)
        expect(camelize('foo-bar')).toBe('fooBar')
        expect(hyphenate('fooBar')).toBe('foo-bar')
        expect(capitalize('foo')).toBe('Foo')
        expect(toHandlerKey('click')).toBe('onClick')
        expect(hasChanged(NaN, NaN)).toBe(false)

        const calls: number[] = []
        invokeArrayFns([(v: number) => calls.push(v), (v: number) => calls.push(v + 1)], 1)
        expect(calls).toEqual([1, 2])

        const hidden: any = {}
        def(hidden, 'x', 1)
        expect(hidden.x).toBe(1)
        expect(Object.keys(hidden)).toEqual([])
        expect(looseToNumber('123-foo')).toBe(123)
        expect(toNumber('123')).toBe(123)
        expect(toNumber('123-foo')).toBe('123-foo')
        expect(isStringOrNumber(1)).toBe(true)
        expect(isReactivableType(new Map())).toBe(true)
        expect(getStackTrace()[0].length).toBeGreaterThan(1)
        expect(isAsync(async () => undefined)).toBe(true)
        expect(isAsync(() => undefined)).toBe(false)
        expect(uuid()).not.toBe(uuid())

        let ticked = false
        nextTick(() => ticked = true)
        await Promise.resolve()
        expect(ticked).toBe(true)

        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        warn('hello')
        expect(warning).toHaveBeenCalledWith('hello')
        warning.mockRestore()

        expect(() => assert(false, 'boom')).toThrow('boom')
    })

    test('replace handles arrays, objects, maps, sets and invalid sources', () => {
        const arr = [1, 2]
        replace(arr, [3, 4, 5])
        expect(arr).toEqual([3, 4, 5])

        const obj: any = {a: 1, b: 2}
        replace(obj, {b: 3, c: 4})
        expect(obj).toEqual({b: 3, c: 4})

        const map = new Map<any, any>([['a', 1], ['b', 2]])
        replace(map, new Map<any, any>([['b', 3], ['c', 4]]))
        expect([...map.entries()]).toEqual([['b', 3], ['c', 4]])

        const set = new Set([1, 2])
        replace(set, new Set([2, 3]))
        expect([...set]).toEqual([2, 3])

        expect(() => replace(1, 2)).toThrow('unknown source type')
    })
})

describe('coverage helpers for debug and atom APIs', () => {
    test('debug naming helpers mark targets and preserve origin behavior', () => {
        function origin<T>(getter: () => T) {
            return getter()
        }

        const getter = () => 1
        expect(isDebugTarget(getter)).toBe(false)
        expect(debug(getter)).toBe(getter)
        expect(isDebugTarget(getter)).toBe(true)

        const named = createName(origin).Total(() => 2)
        expect(named).toBe(2)

        const namedPlainGetter = () => 5
        expect(createDebugWithName(origin).Plain(namedPlainGetter)).toBe(5)
        expect(getDebugName(namedPlainGetter)).toBe('Plain')

        const namedGetter = () => 3
        const namedDebug = createDebugWithName(origin).Count.debug(namedGetter)
        expect(namedDebug).toBe(3)
        expect(getDebugName(namedGetter)).toBe('Count')
        expect(isDebugTarget(namedGetter)).toBe(true)

        const directDebugGetter = () => 4
        expect(createDebug(origin)(directDebugGetter)).toBe(4)
        expect(isDebugTarget(directDebugGetter)).toBe(true)

        const target = {}
        setDebugName(target, 'Target')
        expect(getDebugName(target)).toBe('Target')
    })

    test('debug event helpers subscribe to effect events', () => {
        const effect = new ReactiveEffect(() => undefined)
        let trackCalls = 0
        let triggerCalls = 0
        onTrack(effect, () => trackCalls++)
        onTrigger(effect, () => triggerCalls++)

        effect.dispatch('track')
        effect.dispatch('trigger')

        expect(trackCalls).toBe(1)
        expect(triggerCalls).toBe(1)
    })

    test('atom fixed lazy and named factories', () => {
        const fixed = (atom as any).fixed(1)
        expect(fixed()).toBe(1)
        fixed(2)
        expect(fixed()).toBe(1)

        let runs = 0
        const lazy = (atom as any).lazy(() => ++runs)
        expect(lazy()).toBe(1)
        expect(lazy()).toBe(2)

        const named = (atom as any).as.Score(1)
        expect(named()).toBe(1)
        expect(getDebugName(named)).toBe('Score')

        const namedByArg = atom(1, undefined, 'NamedAtom')
        expect(getDebugName(namedByArg)).toBe('NamedAtom')

        const objectAtom = atom({value: 1})
        expect(`${objectAtom}`).toBe('[object Function]')
    })
})

describe('coverage helpers for collection and time APIs', () => {
    test('RxMap forEach and iterator expose tracked entries', () => {
        const map = new RxMap<string, number>({a: 1, b: 2})
        const seen: Array<[string, number]> = []
        map.forEach((value, key) => seen.push([key, value]))
        expect(seen).toEqual([['a', 1], ['b', 2]])

        const iterator = map[Symbol.iterator]()
        expect(iterator.next()).toEqual({value: ['a', 1], done: false})
        expect(iterator.next()).toEqual({value: ['b', 2], done: false})
        expect(iterator.next()).toEqual({done: true})
        expect([...map]).toEqual([['a', 1], ['b', 2]])
    })

    test('RxSet superset forEach and toList update incrementally', () => {
        const base = new RxSet([1, 2, 3])
        const other = new RxSet([1, 2])
        const superset = base.isSupersetOf(other)
        expect(superset()).toBe(true)

        other.add(4)
        expect(superset()).toBe(false)
        base.add(4)
        expect(superset()).toBe(true)

        const seen: number[] = []
        base.forEach(item => seen.push(item))
        expect(seen).toEqual([1, 2, 3, 4])

        const list = base.toList()
        expect(list.toArray()).toEqual([1, 2, 3, 4])
        base.delete(2)
        expect(list.toArray()).toEqual([1, 3, 4])
        base.add(5)
        expect(list.toArray()).toEqual([1, 3, 4, 5])

        destroyComputed(superset)
    })

    test('RxTime div eq subscribe destroy and resolved mutation guard', async () => {
        const time = new RxTime()
        const [coefficient, constant] = time.add(10).mul(4).div(2).simplifying()
        expect(coefficient).toBe(2)
        expect(constant).toBe(20)

        const eqTime = new RxTime()
        const eq = eqTime.eq(Date.now())
        expect(typeof eq()).toBe('boolean')
        eqTime.destroy()

        const subscribed = new RxTime()
        const tick = subscribed.subscribe(1)
        const first = tick()
        await wait(5)
        expect(tick()).toBeGreaterThanOrEqual(first)
        subscribed.destroy()

        const resolved = new RxTime()
        resolved.gt(Date.now() + 100)
        expect(() => resolved.add(1)).toThrow('RxTime can not be modified after resolved')
        resolved.destroy()
    })

    test('LinkedList helpers remove and read nodes', () => {
        const first = {value: 1}
        const second = {value: 2}
        const third = {value: 3}
        const list = new LinkedList([first, second, third])

        expect(list.at(0)?.item).toBe(first)
        expect(list.at(-1)?.item).toBe(third)
        expect(list.getNodeByItem(second)?.item).toBe(second)
        expect(list.map(node => node.item.value)).toEqual([1, 2, 3])

        list.removeBetween(list.getNodeByItem(first), list.getNodeByItem(second))
        expect(list.map(node => node.item.value)).toEqual([3])

        list.removeBetween()
        expect(list.map(node => node.item.value)).toEqual([])
    })
})

describe('coverage helpers for core lifecycle APIs', () => {
    test('RxList map cleanup and destroy releases item resources', () => {
        const source = new RxList([1, 2, 3])
        const cleanupCalls: number[] = []
        const optionCleanupCalls: number[] = []
        const mapped = source.map((item, index, {onCleanup}) => {
            onCleanup(() => cleanupCalls.push(item))
            return item + index()
        }, {
            onCleanup(item) {
                optionCleanupCalls.push(item)
            }
        })

        expect(mapped.toArray()).toEqual([1, 3, 5])
        expect(source.atomIndexesDepCount).toBe(1)

        source.splice(1, 1, 4)
        expect(mapped.toArray()).toEqual([1, 5, 5])
        expect(cleanupCalls).toEqual([2])
        expect(optionCleanupCalls).toEqual([3])

        mapped.destroy()
        expect(source.atomIndexesDepCount).toBe(0)
        expect(source.atomIndexes).toBeUndefined()
        expect(cleanupCalls).toContain(1)
        expect(cleanupCalls).toContain(4)
        expect(cleanupCalls).toContain(3)
    })

    test('RxList map explicit set runs previous cleanup', () => {
        const source = new RxList([1, 2])
        const cleanupCalls: number[] = []
        const mapped = source.map((item, _index, {onCleanup}) => {
            onCleanup(() => cleanupCalls.push(item))
            return item * 2
        })

        expect(mapped.toArray()).toEqual([2, 4])
        source.set(0, 10)
        expect(mapped.toArray()).toEqual([20, 4])
        expect(cleanupCalls).toEqual([1])
        mapped.destroy()
    })

    test('RxList derived atom destroy callbacks release inner computations', () => {
        const source = new RxList([1, 2, 3])
        const found = source.find(item => item > 1)
        const every = source.every(item => item > 0)
        const some = source.some(item => item === 2)

        expect(found()).toBe(2)
        expect(every()).toBe(true)
        expect(some()).toBe(true)

        destroyComputed(found)
        destroyComputed(every)
        destroyComputed(some)

        source.splice(0, 3, 10)
        expect(found()).toBe(2)
        expect(every()).toBe(true)
        expect(some()).toBe(true)
    })

    test('RxList findIndex rechecks earlier explicit key changes', () => {
        const source = new RxList([1, 5, 10])
        const foundIndex = source.findIndex(item => item > 8)

        expect(foundIndex()).toBe(2)
        source.set(1, 9)
        expect(foundIndex()).toBe(1)

        destroyComputed(foundIndex)
    })

    test('RxList index selection supports atom and set current values with auto reset', async () => {
        const source = new RxList(['a', 'b', 'c'])
        const selectedIndex = atom<number | null>(2)
        const atomSelection = source.createIndexKeySelection(selectedIndex, true)

        expect(atomSelection.toArray().map(([, selected]) => selected())).toEqual([false, false, true])
        source.splice(1, 2)
        expect(atomSelection.toArray().map(([, selected]) => selected())).toEqual([false])
        atomSelection.destroy()

        const selectedIndexes = new RxSet<number>([0, 1])
        const setSelection = source.createIndexKeySelection(selectedIndexes, true)
        expect(setSelection.toArray().map(([, selected]) => selected())).toEqual([true])
        source.clear()
        expect(setSelection.toArray()).toEqual([])
        await Promise.resolve()
        setSelection.destroy()

        const resetSource = new RxList(['x', 'y'])
        const resetIndex = atom<number | null>(1)
        const resetSelection = resetSource.createIndexKeySelection(resetIndex, true)
        resetSource.pop()
        expect(resetIndex()).toBe(null)
        expect(resetSelection.toArray().map(([, selected]) => selected())).toEqual([false])
        await Promise.resolve()
        resetSelection.destroy()
    })

    test('RxList multi-selection destroy cleans auto reset effects', () => {
        const source = new RxList(['a', 'b'])
        const selectedA = atom<string | null>('a')
        const selectedB = new RxSet<string | number>(['b'])
        const selections = source.createSelections([selectedA, true], [selectedB, true])

        expect(selections.toArray().map(([, a, b]) => [a(), b()])).toEqual([[true, false], [false, true]])
        selections.destroy()
        source.clear()
        expect(selectedA()).toBe('a')
        expect(selectedB.toArray()).toEqual(['b'])
    })

    test('Computed helpers cover recompute cache async patch and scheduling', async () => {
        const source = atom(1)
        const value = computed(() => source() + 1)
        expect(isComputed(value)).toBe(true)
        expect(getComputedGetter(value)).toBeTypeOf('function')
        expect(value()).toBe(2)

        source(2)
        expect(value()).toBe(3)
        recompute(value, true)
        expect(value()).toBe(3)

        const instance = new Computed(() => 1)
        let created = 0
        expect(instance.getCachedValue('key', () => ++created)).toBe(1)
        expect(instance.getCachedValue('key', () => ++created)).toBe(1)
        expect(created).toBe(1)

        instance.createCleanPromise()
        const cleanPromise = instance.cleanPromise!
        instance.rejectCleanPromise?.('failed')
        await expect(cleanPromise).rejects.toBe('failed')

        let scheduled = 0
        scheduleNextTick.call(instance, () => scheduled++, () => undefined)
        scheduleNextTick.call(instance, () => scheduled++, () => undefined)
        await Promise.resolve()
        expect(scheduled).toBe(1)

        const patchSource = atom(1)
        const patched = computed(
            function(this: Computed) {
                this.manualTrack(patchSource, TrackOpTypes.ATOM, 'value')
                return patchSource.raw
            },
            async (data) => {
                await Promise.resolve()
                data(patchSource.raw + 10)
            }
        )
        expect(patched()).toBe(1)
        patchSource(2)
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(patched()).toBe(12)
        destroyComputed(patched)
        destroyComputed(value)
        instance.destroy()
    })

    test('ReactiveEffect base methods and recursive guard are covered', async () => {
        class TestEffect extends ReactiveEffect {
            calls = 0
            callGetter() {
                this.calls++
                return this.calls
            }
        }

        const effect = new TestEffect(() => undefined)
        const callback = vi.fn()
        expect(effect.eventToCallbacks).toBeInstanceOf(Map)
        expect(effect.asyncTracks).toEqual([])
        expect(effect.children).toEqual([])
        effect.on('x', callback)
        effect.dispatch('x', 1)
        effect.off('x', callback)
        effect.dispatch('x', 2)
        expect(callback).toHaveBeenCalledTimes(1)

        expect(effect.run()).toBe(1)
        effect.active = false
        expect(effect.run()).toBe(2)

        const recursive = new TestEffect(() => undefined)
        ReactiveEffect.activeScopes.push(recursive)
        expect(() => recursive.run()).toThrow('recursive effect call')
        ReactiveEffect.activeScopes.pop()

        const generatorEffect = new TestEffect(function* () {
            yield Promise.resolve(1)
            return 2
        })
        generatorEffect.isAsync = true
        ;(generatorEffect as any).callGetter = function* () {
            yield Promise.resolve(1)
            return 2
        }
        await expect(generatorEffect.run()).resolves.toBe(2)
        expect(generatorEffect.isRunningAsync).toBe(false)

        effect.onDirty()
        effect.onTrack()
        effect.onTrackDep({})
    })

    test('manual tracking recursive dirty and AsyncRxSlice destroy paths', async () => {
        const source = atom(1)
        const parent = new Computed(function(this: Computed) {
            this.manualTrack(source, TrackOpTypes.ATOM, 'value')
        }, undefined, true)
        parent.trackClassInstance = true
        const child = new Computed(function(this: Computed) {
            this.manualTrack(parent, TrackOpTypes.ATOM, 'value')
        }, undefined, true)

        parent.run([], true)
        child.run([], true)
        parent.recursiveMarkDirty()
        expect(parent.markedDirtyEffects.has(child)).toBe(true)

        const slice = new AsyncRxSlice<number>([], () => Promise.resolve([1, 2, 3]), item => item)
        await slice.fetch()
        expect(slice.toArray()).toEqual([1, 2, 3])
        slice.destroy()

        parent.destroy()
        child.destroy()
    })

    test('AsyncRxSlice handles fetch/update errors and cursor helpers', async () => {
        const error = new Error('boom')
        const failing = new AsyncRxSlice<number>([], () => Promise.reject(error), item => item)

        await failing.fetchFullRemoteData()
        expect(failing.loadError()).toBe(error)

        await failing.update(0)
        expect(failing.isLoading()).toBe(false)
        expect(failing.loadError()).toBe(error)

        const calls: any[] = []
        const slice = new AsyncRxSlice<number>([2], async (...args) => {
            calls.push(args)
            return [args[3] ? 1 : 3]
        }, item => item)

        await slice.append(1, 4)
        expect(slice.toArray()).toEqual([2, 3])
        await slice.prepend(1, 0)
        expect(slice.toArray()).toEqual([1, 2, 3])
        await slice.moveForward(1, 4)
        expect(slice.toArray()).toEqual([3])
        await slice.moveBackward(1, 0)
        expect(slice.toArray()).toEqual([1])
        expect(calls).toEqual([
            [2, 1, 4, false],
            [2, 1, 0, true],
            [3, 1, 4, false],
            [3, 1, 0, true],
        ])
    })

    test('AsyncRxSlice ignores stale full fetch results', async () => {
        const resolvers: Array<(items: number[]) => void> = []
        const slice = new AsyncRxSlice<number>([], () => {
            return new Promise<number[]>(resolve => {
                resolvers.push(resolve)
            })
        }, item => item)

        const first = slice.fetchFullRemoteData()
        const second = slice.fetchFullRemoteData()

        resolvers[1]([2])
        await second
        expect(slice.toArray()).toEqual([2])

        resolvers[0]([1])
        await first
        expect(slice.toArray()).toEqual([2])
    })

    test('RxMap replace updates existing keys and removes old keys', () => {
        const map = new RxMap<string, number>({a: 1, b: 2})
        const values = map.values()
        const keys = map.keys()

        map.replace(new Map([['b', 3], ['c', 4]]))
        expect(keys.toArray()).toEqual(['b', 'c'])
        expect(values.toArray()).toEqual([3, 4])

        map.set('b', 3)
        expect(values.toArray()).toEqual([3, 4])

        map.delete('missing')
        expect(keys.toArray()).toEqual(['b', 'c'])
    })

    test('RxMap replace accepts plain objects and entry arrays', () => {
        const map = new RxMap<string, number>({a: 1})

        map.replace({b: 2, c: 3})
        expect(map.entries().toArray()).toEqual([['b', 2], ['c', 3]])

        map.replace([['c', 4], ['d', 5]])
        expect(map.entries().toArray()).toEqual([['c', 4], ['d', 5]])
    })

    test('RxTime recomputes atom operands in arithmetic expressions', () => {
        const addValue = atom(10)
        const subValue = atom(5)
        const mulValue = atom(2)
        const divValue = atom(2)
        const time = new RxTime().add(addValue).sub(subValue).mul(mulValue).div(divValue)

        expect(time.simplifying()).toEqual([1, 5])

        addValue(20)
        subValue(2)
        mulValue(3)
        divValue(2)

        expect(time.simplifying()).toEqual([1.5, 27])
    })

    test('RxList index selection keeps index zero semantics through head changes', () => {
        const source = new RxList(['a', 'b'])
        const selectedIndex = atom<number | null>(0)
        const selection = source.createIndexKeySelection(selectedIndex, true)

        expect(selection.toArray().map(([item, selected]) => [item, selected()])).toEqual([
            ['a', true],
            ['b', false],
        ])

        source.unshift('z')
        expect(selectedIndex()).toBe(0)
        expect(selection.toArray().map(([item, selected]) => [item, selected()])).toEqual([
            ['z', true],
            ['a', false],
            ['b', false],
        ])

        source.shift()
        expect(selectedIndex()).toBe(0)
        expect(selection.toArray().map(([item, selected]) => [item, selected()])).toEqual([
            ['a', true],
            ['b', false],
        ])

        source.clear()
        expect(selectedIndex()).toBe(null)
        expect(selection.toArray()).toEqual([])
    })

    test('RxSet derived boolean destroy stops internal updates', () => {
        const left = new RxSet([1, 2])
        const right = new RxSet([2])
        const disjoint = left.isDisjointFrom(right)
        const subset = right.isSubsetOf(left)

        expect(disjoint()).toBe(false)
        expect(subset()).toBe(true)

        destroyComputed(disjoint)
        destroyComputed(subset)

        right.delete(2)
        expect(disjoint()).toBe(false)
        expect(subset()).toBe(true)
    })

    test('onChange destroy stops list change notifications', () => {
        const list = new RxList<number>([])
        const history: any[] = []
        const stop = onChange(list, infos => history.push(infos))

        list.push(1)
        stop()
        list.push(2)

        expect(history).toHaveLength(1)
    })

    test('ManualCleanup base destroy and retained diagnostics flag are callable', () => {
        const cleanup = new ManualCleanup()
        cleanup.destroy()
        expect(isData0RetainedObjectDiagnosticsEnabled()).toBe(false)
    })

    test('Notifier trigger branches cover collection, clear, length and pause guards', () => {
        const target: any[] = [1, 2, 3]
        class CapturingEffect extends ReactiveEffect {
            triggerInfos: any[] = []
            run(infos: any[] = []) {
                this.triggerInfos.push(...infos)
            }
        }
        const effect = new CapturingEffect(() => undefined)
        Notifier.instance.targetMap.set(target, new Map([
            ['length', new Set([effect]) as any],
            ['2', new Set([effect]) as any],
        ]))

        Notifier.instance.trigger(target, TriggerOpTypes.SET, {key: 'length', newValue: 1})
        expect(effect.triggerInfos.length).toBeGreaterThan(0)
        effect.triggerInfos.length = 0

        Notifier.instance.shouldTrigger = false
        Notifier.instance.trigger(target, TriggerOpTypes.SET, {key: 'length', newValue: 0})
        Notifier.instance.shouldTrigger = true
        expect(effect.triggerInfos.length).toBe(0)

        Notifier.instance.targetMap.delete(target)

        const objectTarget = {}
        const objectEffect = new CapturingEffect(() => undefined)
        Notifier.instance.targetMap.set(objectTarget, new Map<any, any>([
            ['field', new Set([objectEffect]) as any],
            [ITERATE_KEY, new Set([objectEffect]) as any],
            [ITERATE_KEY_KEY_ONLY, new Set([objectEffect]) as any],
            [TriggerOpTypes.METHOD, new Set([objectEffect]) as any],
            [TriggerOpTypes.EXPLICIT_KEY_CHANGE, new Set([objectEffect]) as any],
        ]))

        Notifier.instance.trigger(objectTarget, TriggerOpTypes.ADD, {key: 'field', newValue: 1})
        Notifier.instance.trigger(objectTarget, TriggerOpTypes.SET, {key: 'field', newValue: 2, oldValue: 1})
        Notifier.instance.trigger(objectTarget, TriggerOpTypes.DELETE, {key: 'field', oldValue: 2})
        Notifier.instance.trigger(objectTarget, TriggerOpTypes.METHOD, {method: 'replace'})
        Notifier.instance.trigger(objectTarget, TriggerOpTypes.EXPLICIT_KEY_CHANGE, {result: {}})
        Notifier.instance.trigger(objectTarget, TriggerOpTypes.CLEAR, {})

        expect(objectEffect.triggerInfos.map(info => info.type)).toEqual([
            TriggerOpTypes.ADD,
            TriggerOpTypes.SET,
            TriggerOpTypes.DELETE,
            TriggerOpTypes.METHOD,
            TriggerOpTypes.EXPLICIT_KEY_CHANGE,
            TriggerOpTypes.CLEAR,
        ])

        Notifier.instance.targetMap.delete(objectTarget)
        effect.destroy()
        objectEffect.destroy()
    })
})
