import type {Dep} from "./dep";
import type {ReactiveEffect} from "./reactiveEffect.js";

type EffectKind = 'ReactiveEffect' | 'Computed'

export type Data0RetainedObjectDiagnosticsSnapshot = {
    enabled: boolean
    reactiveEffects: {
        activeByType: Record<EffectKind, number>
        createdByType: Record<EffectKind, number>
        destroyedByType: Record<EffectKind, number>
        activeBySource: Record<string, number>
        createdBySource: Record<string, number>
        destroyedBySource: Record<string, number>
        totalActive: number
    }
    primitiveAtomDeps: {
        activeDeps: number
        createdDeps: number
        activeEffects: number
    }
}

const effectRecords = new WeakMap<ReactiveEffect, { kind: EffectKind, source: string, generation: number }>()
const primitiveAtomDeps = new WeakSet<Dep>()
const primitiveAtomDepSubscriberCounts = new WeakMap<Dep, { count: number, generation: number }>()
let enabled = false
let generation = 0

const reactiveEffects = {
    activeByType: createEffectKindCounters(),
    createdByType: createEffectKindCounters(),
    destroyedByType: createEffectKindCounters(),
    activeBySource: {} as Record<string, number>,
    createdBySource: {} as Record<string, number>,
    destroyedBySource: {} as Record<string, number>,
}
const primitiveAtomDepCounters = {
    activeDeps: 0,
    createdDeps: 0,
    activeEffects: 0,
}

function createEffectKindCounters(): Record<EffectKind, number> {
    return {
        ReactiveEffect: 0,
        Computed: 0,
    }
}

function increment(counters: Record<string, number>, key: string, delta = 1) {
    counters[key] = (counters[key] ?? 0) + delta
    if (counters[key] === 0) delete counters[key]
}

function resetCounters(counters: Record<string, number>) {
    Object.keys(counters).forEach(key => delete counters[key])
}

function getDefaultEffectSource(effect: ReactiveEffect, kind: EffectKind) {
    const constructorName = effect.constructor?.name
    return constructorName || kind
}

function resetEffectKindCounters(counters: Record<EffectKind, number>) {
    counters.ReactiveEffect = 0
    counters.Computed = 0
}

function cloneEffectKindCounters(counters: Record<EffectKind, number>): Record<EffectKind, number> {
    return {
        ReactiveEffect: counters.ReactiveEffect,
        Computed: counters.Computed,
    }
}

export function enableData0RetainedObjectDiagnostics(options: { reset?: boolean } = {}) {
    if (options.reset ?? true) resetData0RetainedObjectDiagnostics()
    enabled = true
}

export function disableData0RetainedObjectDiagnostics() {
    enabled = false
}

export function resetData0RetainedObjectDiagnostics() {
    generation++
    resetEffectKindCounters(reactiveEffects.activeByType)
    resetEffectKindCounters(reactiveEffects.createdByType)
    resetEffectKindCounters(reactiveEffects.destroyedByType)
    resetCounters(reactiveEffects.activeBySource)
    resetCounters(reactiveEffects.createdBySource)
    resetCounters(reactiveEffects.destroyedBySource)
    primitiveAtomDepCounters.activeDeps = 0
    primitiveAtomDepCounters.createdDeps = 0
    primitiveAtomDepCounters.activeEffects = 0
}

export function isData0RetainedObjectDiagnosticsEnabled() {
    return enabled
}

export function trackRetainedReactiveEffectCreated(effect: ReactiveEffect) {
    if (!enabled) return
    const source = getDefaultEffectSource(effect, 'ReactiveEffect')
    effectRecords.set(effect, {kind: 'ReactiveEffect', source, generation})
    reactiveEffects.activeByType.ReactiveEffect++
    reactiveEffects.createdByType.ReactiveEffect++
    increment(reactiveEffects.activeBySource, source)
    increment(reactiveEffects.createdBySource, source)
}

export function markRetainedReactiveEffectKind(effect: ReactiveEffect, kind: EffectKind, source = getDefaultEffectSource(effect, kind)) {
    if (!enabled) return
    const record = effectRecords.get(effect)
    if (!record || record.generation !== generation) return
    if (record.kind === kind && record.source === source) return

    effectRecords.set(effect, {kind, source, generation})
    reactiveEffects.activeByType[record.kind]--
    reactiveEffects.createdByType[record.kind]--
    reactiveEffects.activeByType[kind]++
    reactiveEffects.createdByType[kind]++
    increment(reactiveEffects.activeBySource, record.source, -1)
    increment(reactiveEffects.createdBySource, record.source, -1)
    increment(reactiveEffects.activeBySource, source)
    increment(reactiveEffects.createdBySource, source)
}

export function setRetainedReactiveEffectSource(effect: ReactiveEffect, source: string) {
    if (!enabled) return
    const record = effectRecords.get(effect)
    if (!record || record.generation !== generation || record.source === source) return

    effectRecords.set(effect, {...record, source})
    increment(reactiveEffects.activeBySource, record.source, -1)
    increment(reactiveEffects.createdBySource, record.source, -1)
    increment(reactiveEffects.activeBySource, source)
    increment(reactiveEffects.createdBySource, source)
}

export function trackRetainedReactiveEffectDestroyed(effect: ReactiveEffect) {
    if (!enabled) return
    const record = effectRecords.get(effect)
    if (!record || record.generation !== generation) return

    reactiveEffects.activeByType[record.kind]--
    reactiveEffects.destroyedByType[record.kind]++
    increment(reactiveEffects.activeBySource, record.source, -1)
    increment(reactiveEffects.destroyedBySource, record.source)
    effectRecords.delete(effect)
}

export function trackRetainedPrimitiveAtomDepCreated(dep: Dep) {
    if (!enabled) return
    primitiveAtomDeps.add(dep)
    primitiveAtomDepCounters.createdDeps++
}

export function trackRetainedDepEffectAdded(dep: Dep) {
    if (!enabled || !primitiveAtomDeps.has(dep)) return
    const record = primitiveAtomDepSubscriberCounts.get(dep)
    const subscriberCount = record?.generation === generation ? record.count : 0
    if (subscriberCount === 0) primitiveAtomDepCounters.activeDeps++
    primitiveAtomDepSubscriberCounts.set(dep, {count: subscriberCount + 1, generation})
    primitiveAtomDepCounters.activeEffects++
}

export function trackRetainedDepEffectRemoved(dep: Dep) {
    if (!enabled || !primitiveAtomDeps.has(dep)) return
    const record = primitiveAtomDepSubscriberCounts.get(dep)
    if (!record || record.generation !== generation) return
    const subscriberCount = record.count
    if (subscriberCount > 1) {
        primitiveAtomDepSubscriberCounts.set(dep, {count: subscriberCount - 1, generation})
    } else if (subscriberCount === 1) {
        primitiveAtomDepSubscriberCounts.delete(dep)
        primitiveAtomDepCounters.activeDeps--
    }
    primitiveAtomDepCounters.activeEffects--
}

export function getData0RetainedObjectDiagnosticsSnapshot(): Data0RetainedObjectDiagnosticsSnapshot {
    const activeByType = cloneEffectKindCounters(reactiveEffects.activeByType)
    const createdByType = cloneEffectKindCounters(reactiveEffects.createdByType)
    const destroyedByType = cloneEffectKindCounters(reactiveEffects.destroyedByType)
    return {
        enabled,
        reactiveEffects: {
            activeByType,
            createdByType,
            destroyedByType,
            activeBySource: {...reactiveEffects.activeBySource},
            createdBySource: {...reactiveEffects.createdBySource},
            destroyedBySource: {...reactiveEffects.destroyedBySource},
            totalActive: activeByType.ReactiveEffect + activeByType.Computed,
        },
        primitiveAtomDeps: {
            activeDeps: primitiveAtomDepCounters.activeDeps,
            createdDeps: primitiveAtomDepCounters.createdDeps,
            activeEffects: primitiveAtomDepCounters.activeEffects,
        },
    }
}
