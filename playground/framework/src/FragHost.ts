import {UnhandledPlaceholder, insertBefore} from './DOM'
import {Atom, computed, destroyComputed, TrackOpTypes, TriggerOpTypes} from "rata";
import { Host } from "./Host";
import {createHost} from "./createHost";

function getSpliceRemoveLength(argv: any[], length: number) : number {
    // CAUTION 按照 mdn 的定义，splice 第二个参数如果是 undefined 但是后面又有其他参数，就会被转成 0。
    const argv1NotUndefined = argv![1] === undefined ? ( argv!.length < 2 ? Infinity : 0 ) : (argv![1] as number)
    const argv1 = argv1NotUndefined < 0 ? 0 : argv1NotUndefined
    return argv1 !== Infinity ? argv1: (length - (argv![0] as number))
}

export class FragHost implements Host{
    handler: FragDOMHandler
    hostsComputed?: Host[]
    placeholderAndItemComputed?: [any, UnhandledPlaceholder][]
    element: ChildNode|DocumentFragment|Comment = this.placeholder
    constructor(public source: ReturnType<typeof computed>, public placeholder:UnhandledPlaceholder, ) {
        this.handler = new FragDOMHandler(placeholder)
    }
    createPlaceholder(item: any): [any, UnhandledPlaceholder] {
        return [item, new Comment('frag item host')]
    }
    createHost([item, placeholder] : [any, UnhandledPlaceholder]) : Host{
        return createHost(item, placeholder)
    }

    render(): void {

        const mapPlaceholderItemPairToPlaceholder = ([, placeholder]: [any, UnhandledPlaceholder]) : UnhandledPlaceholder => placeholder

        this.placeholderAndItemComputed = computed(
            (trackOnce) => {
                // FIXME 这里支持不了重算，因为理论上重算需要把所有 Placeholder remove。但是placeholder 重算以为这下面的 host 也会重算，
                //  host 的重算依赖了这里产生的 placeholder，但这里 placeholder 已经 remove 了，做 dom 操作的时候就会出问题。

                trackOnce!(this.source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                const placeholderAndItems = this.source.map(this.createPlaceholder)
                this.handler.replace(...placeholderAndItems.map(mapPlaceholderItemPairToPlaceholder))
                return placeholderAndItems
            },
            (placeholderAndItems, triggerInfos) => {
                // CAUTION 特别注意，下面必须先处理 element 再处理数据，因为数据的处理会连环触发下面的  computed 也重新就散。
                triggerInfos.forEach(({method, argv, result}) => {
                    if (method === 'push') {
                        const newPlaceholderAndItems = argv!.map(this.createPlaceholder)
                        this.handler.push(...newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder))
                        placeholderAndItems.push(...newPlaceholderAndItems)
                    } else if (method === 'pop') {
                        // placeholders 里面已经处理
                        placeholderAndItems.pop()
                        // CAUTION 不需要处理 placeholder，因为下面的 computed 里的 Host 会处理。
                    } else if (method === 'shift') {
                        placeholderAndItems.shift()
                        // CAUTION 不需要处理 placeholder，因为下面的 computed 里的 Host 会处理。
                    } else if (method === 'unshift') {
                        const newPlaceholderAndItems = argv!.map(this.createPlaceholder)
                        const newPlaceholders = newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder)
                        const firstEl = this.hostsComputed?.length ? this.hostsComputed[0].element : this.placeholder
                        this.handler.insertBefore(newPlaceholders, firstEl as ChildNode|Comment)
                        placeholderAndItems.unshift(...newPlaceholderAndItems)
                    } else if (method === 'splice') {
                        const newPlaceholderAndItems = argv!.slice(2)!.map(this.createPlaceholder)

                        const spliceToEnd = argv![1] === undefined || (argv![1] === placeholderAndItems.length - argv![0])
                        const afterIndex = argv![0] - 1

                        // 加在最后了
                        if (spliceToEnd) {
                            this.handler.push(...newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder))
                        } else{
                            // 加在头部
                            if (afterIndex < 0) {
                                const firstEl = this.hostsComputed?.length ? this.hostsComputed[0].element : this.placeholder
                                this.handler.insertBefore(newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder), firstEl as ChildNode|Comment)
                            } else {
                                // 加在中间了
                                const afterPlaceholder: UnhandledPlaceholder = placeholderAndItems[afterIndex][1]
                                // CAUTION 这里一定要用 insertAfter，因为 placeholder 前面是真正的元素。
                                this.handler.insertAfter(newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder), afterPlaceholder)
                            }
                        }

                        placeholderAndItems.splice(argv![0], argv![1], ...newPlaceholderAndItems)
                        // CAUTION 不需要处理 placeholder，因为下面的 computed 里的 Host 会处理。

                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            },
            function onDirty(recompute) {
                recompute()
            }
        )



        this.hostsComputed = computed(
            (trackOnce) => {
                if (this.hostsComputed?.length) throw new Error('hostsComputed should not recompute')
                // 清空上一次的
                this.hostsComputed?.forEach(host => host.destroy())

                trackOnce!(this.placeholderAndItemComputed!, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                const hosts = this.placeholderAndItemComputed!.map(([item, placeholder]) => createHost(item, placeholder))
                hosts.forEach(host => host.render())
                return hosts
            },
            (hosts, triggerInfos) => {
                triggerInfos.forEach(({method, argv, result}) => {
                    if (method === 'push') {
                        const newHosts = argv!.map(this.createHost)
                        newHosts.forEach(host => host.render())
                        hosts.push(...newHosts)
                    } else if (method === 'pop') {
                        const last = hosts.pop()
                        last.destroy()
                    } else if (method === 'shift') {
                        const first = hosts.shift()
                        first.destroy()
                    } else if (method === 'unshift') {
                        const newHosts = argv!.map(this.createHost)
                        newHosts.forEach(host => host.render())
                        hosts.unshift(...newHosts)
                    } else if (method === 'splice') {
                        const newHosts = argv!.slice(2)!.map(this.createHost)
                        newHosts.forEach(host => host.render())
                        const removeLength = getSpliceRemoveLength(argv!, hosts.length)
                        const removed = hosts.splice(argv![0], removeLength, ...newHosts)
                        // debugger
                        removed.forEach((host: Host) => host.destroy())
                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            },
            function onDirty(recompute) {
                recompute()
            }
        )
    }
    destroy() {
        // 理论上我们只需要处理自己的 placeholder 就行了，下面的 host 会处理各自的元素
        this.hostsComputed!.forEach(host => host.destroy())
        this.placeholder.remove()

        destroyComputed(this.hostsComputed)
        destroyComputed(this.placeholderAndItemComputed)

    }
}


export class FragDOMHandler {
    fragmentParent = document.createDocumentFragment()
    firstEl: ChildNode|Comment = this.placeholder
    constructor(public placeholder:UnhandledPlaceholder) {

    }
    get parentElement() {
        return this.placeholder.parentElement || this.fragmentParent
    }
    push(...newEl: ChildNode[]) {
        if (!newEl.length) return

        if (this.firstEl === this.placeholder) this.firstEl = newEl[0]

        const frag = document.createDocumentFragment()
        frag.replaceChildren(...newEl)
        insertBefore(frag, this.placeholder as ChildNode)
    }
    pop() {
        if (this.placeholder === this.firstEl) return

        if (this.placeholder.previousSibling === this.firstEl) this.firstEl = this.placeholder

        this.placeholder.previousSibling!.remove()
    }
    shift() {
        if (this.placeholder === this.firstEl) return

        if (this.placeholder.previousSibling === this.firstEl) {
            this.firstEl = this.placeholder
            this.placeholder.previousSibling.remove()
        } else {
            const firstEl = this.firstEl
            this.firstEl = firstEl.nextSibling!
            firstEl.remove()
        }
    }
    unshift(...newEl: ChildNode[]) {
        if (!newEl.length) return

        const frag = document.createDocumentFragment()
        frag.replaceChildren(...newEl)
        insertBefore(frag, this.firstEl)

        this.firstEl = newEl[0]
    }
    splice(startIndex: number, length?: number, ...newEl: ChildNode[]) {
        if (length === 0) return


        let pointer = this.firstEl
        let startCount = 0
        while(startCount < startIndex && pointer !== this.placeholder) {
            pointer = pointer.nextSibling!
            startCount++
        }

        const endLength = length || (this.placeholder.parentElement!.childNodes.length - startIndex)

        let count = 0
        while(pointer !== this.placeholder && count < endLength) {
            const current = pointer
            pointer = current.nextSibling!
            current.remove()
            count++
        }

        const frag = document.createDocumentFragment()
        frag.replaceChildren(...newEl)
        insertBefore(frag, pointer)


        if (startIndex === 0) {
            this.firstEl = newEl.length ? newEl[0] : pointer
        }
    }
    replace(...newEl: ChildNode[]) {
        return this.splice(0, undefined, ...newEl)
    }
    insertAfter(newEl:ChildNode|ChildNode[], refNode:ChildNode) {
        let toInsert: ChildNode|DocumentFragment
        if (Array.isArray(newEl) ) {
            toInsert = document.createDocumentFragment()
            toInsert.replaceChildren(...newEl)
        } else {
            toInsert = newEl
        }

        return insertBefore(toInsert, refNode.nextSibling!)
    }
    insertBefore(newEl:ChildNode|ChildNode[], refNode:ChildNode|Comment) {
        let toInsert: ChildNode|DocumentFragment
        if (Array.isArray(newEl) ) {
            toInsert = document.createDocumentFragment()
            toInsert.replaceChildren(...newEl)
        } else {
            toInsert = newEl
        }
        return insertBefore(toInsert, refNode)
    }

    detach() {
        let pointer = this.firstEl
        while(pointer !== this.placeholder) {
            const current = pointer
            pointer = current.nextSibling!
            this.fragmentParent.appendChild(current)
        }

        this.fragmentParent.appendChild(this.placeholder)
    }
    // TODO destroy? 里面的 computed 是需要显式的 destroy 才会  stop 的

}