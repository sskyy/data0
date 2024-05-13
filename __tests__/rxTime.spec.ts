import {describe, test, expect} from "vitest";
import {RxTime} from "../src/RxTime.js";
import {atom} from "../src/index.js";

function wait(time: number) {
    return new Promise(resolve => {
        setTimeout(resolve, time)
    })
}

describe('RxTime test', () => {
    test('basic', async() => {
        const now = Date.now()
        const time = new RxTime()
        const is100Later = time.gt(now + 100)
        expect(is100Later()).toBe(false)
        await wait(101)
        expect(is100Later()).toBe(true)
    })

    test('basic operations', async() => {
        const createdAt = Date.now()
        const time = new RxTime()
        const expired = time.sub(createdAt).gt(100)
        expect(expired()).toBe(false)
        await wait(101)
        expect(expired()).toBe(true)
    })

    test('operations with RxTime as operation value', async() => {
        const time = new RxTime()
        const now = Date.now()

        const is = time.mul(3).sub(new RxTime()).lt((new RxTime()).add(100).add(now))
        expect(is()).toBe(true)
        await wait(101)
        expect(is()).toBe(false)
    })

    test('operation with atom value', async () => {
        const createdAt = Date.now()
        const time = new RxTime()
        const limit = atom(100)
        const expired = time.sub(createdAt).gt(limit)
        expect(expired()).toBe(false)
        // 立刻重算过期
        limit(-1)
        expect(expired()).toBe(true)
        limit(100)
        expect(expired()).toBe(false)
        await wait(101)
        expect(expired()).toBe(true)
    })
})
