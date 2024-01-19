import {describe, expect, test} from "vitest";
import {AsyncRxSlice} from "../src/AsyncRxSlice.js";
import {atom} from "../src/atom.js";

describe('RxSlice', () => {
    // 10 个模拟数据
    const data = [
        {id:1, name: 'a'},
        {id:2, name: 'b'},
        {id:3, name: 'c'},
        {id:4, name: 'd'},
        {id:5, name: 'e'},
        {id:6, name: 'f'},
        {id:7, name: 'g'},
        {id:8, name: 'h'},
        {id:9, name: 'i'},
        {id:10, name: 'j'},
    ]

    const getRemoteData = (cursor?: number, length?: number, stop?: number, fetchBeforeCursor?: boolean) : Promise<{id:number, name:string}[]> => {
        let result
        if(stop !== undefined) {
            if (cursor === undefined) {
                result = data.slice(0, stop)
            } else {
                if (fetchBeforeCursor) {
                    result = data.slice(stop!, cursor)
                } else {
                    result = data.slice(cursor, stop!)
                }
            }
        } else {
            if (cursor === undefined) {
                result= data.slice(0, length)
            } else {
                if (fetchBeforeCursor) {
                    result= data.slice(cursor-length!-1!, cursor-1)
                } else {
                    result= data.slice(cursor, cursor+length!)
                }
            }
        }

        return new Promise<{id:number, name:string}[]>((resolve) => {
            setTimeout(() => {
                resolve(result! as {id:number, name:string}[])
            }, 10)
        })
    }


    test('map to another list', async () => {
        const initialCursor = atom(5)
        const list = new AsyncRxSlice([], (inputCursor?: number, inputLength?: number, stop?: number, fetchBeforeCursor?: boolean) => {
            const cursor = inputCursor === undefined ? initialCursor() : inputCursor
            const length = inputLength === undefined ? 2 : inputLength
            return getRemoteData(cursor, length, stop, fetchBeforeCursor)
        }, (item: any) => item.id)

        await list.fetch()
        expect(list.data).toMatchObject([ {id:6, name: 'f'}, {id:7, name: 'g'}])

        await list.append(2);
        expect(list.data).toMatchObject([ {id:6, name: 'f'}, {id:7, name: 'g'}, {id:8, name: 'h'}, {id:9, name: 'i'}])

        await list.prepend(2);
        expect(list.data).toMatchObject([ {id:4, name: 'd'}, {id:5, name: 'e'}, {id:6, name: 'f'}, {id:7, name: 'g'}, {id:8, name: 'h'}, {id:9, name: 'i'}])

        await list.moveBackward(2);
        expect(list.data).toMatchObject([ {id:2, name: 'b'}, {id:3, name: 'c'}])


        await list.moveForward(2);
        expect(list.data).toMatchObject([ {id:4, name: 'd'}, {id:5, name: 'e'}])

        // 修改 initialCursor 应该会自动触发 autoFetchRecompute
        initialCursor(3)
        await list.fetch()
        expect(list.data).toMatchObject([ {id:4, name: 'd'}, {id:5, name: 'e'}])
    })


})