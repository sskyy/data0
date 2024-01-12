// @ts-ignore
import {ITERATE_KEY, track, Notifier} from './notify'
import {TrackOpTypes, TriggerOpTypes} from "./operations";


class ListNode<T> {
    prev?: ListNode<T>
    next?: ListNode<T>
    constructor(public item: T) {
    }
}

export class LinkedList<T extends object> implements Iterable<ListNode<T>>{
    head?: ListNode<T>
    tail?: ListNode<T>
    itemToNode = new WeakMap<T, ListNode<T>>()
    constructor(source: T[])  {
        let prev: ListNode<T>|undefined = undefined
        source.forEach(item => {
            const node = this.createNode(item)
            if (prev) {
                prev.next = node
                node.prev = prev
            } else {
                this.head = node
            }
            prev = node
        })
        this.tail = prev
    }
    createNode(item:T) {
        const node = new ListNode(item)
        this.itemToNode.set(item, node)
        return node
    }
    insertBefore(newItem: T, refNode?: ListNode<T>) {
        const newNode = this.createNode(newItem)
        if (!this.head) {
            this.head = this.tail = newNode
        } else {
            // 没有 ref ，insert 在尾部，和 dom API 保持一致
            if (!refNode) {
                this.tail!.next = newNode
                newNode.prev = this.tail
                this.tail = newNode
            } else {
                newNode.prev = refNode.prev
                if (newNode.prev) newNode.prev.next = newNode

                newNode.next = refNode
                refNode.prev = newNode
                if (this.head === refNode) {
                    this.head = newNode
                }
            }
        }

        Notifier.instance.trigger(this, TriggerOpTypes.METHOD, { method:'insertBefore', argv: [newItem, refNode], result: { add:[{newValue:newNode}]}})
        Notifier.instance.trigger(this, TriggerOpTypes.ADD, { key: ITERATE_KEY })
        return newNode
    }
    // removeBetween 移除的部分包含 startNode 和 endNode
    // TODO 支持 startNode, endNode 缺省的情况，说明删到末尾
    removeBetween(startNode: ListNode<T>|undefined = this.head, endNode:ListNode<T>|undefined = this.tail) {
        const prev = startNode?.prev
        const next = endNode?.next
        if (prev) {
            prev.next = next
        } else {
            this.head = next
        }

        if (next) {
            next.prev = prev
        } else {
            this.tail = prev
        }


        Notifier.instance.trigger(this, TriggerOpTypes.METHOD, { method:'removeBetween', argv: [startNode, endNode]})
        Notifier.instance.trigger(this, TriggerOpTypes.ADD, { key: ITERATE_KEY})
    }

    getNodeByItem(item: T){
        return this.itemToNode.get(item)
    }
    *[Symbol.iterator]() {
        Notifier.instance.track(this, TrackOpTypes.ITERATE,  ITERATE_KEY)
        let current = this.head
        while(current) {
            yield current
            current = current.next
        }
    }
    map(mapFn: (node: ListNode<T>) => any) {
        const result = []
        for(let node of this) {
            result.push(mapFn(node))
        }
        return result
    }
    at(index: number) {
        if (index === -1) return this.tail
        let count = 0
        let current = this.head
        while(current && count < index) {
            current = current.next
            count++
        }
        return current
    }
}
