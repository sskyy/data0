import {UnhandledPlaceholder, insertBefore} from './DOM'
import {computed, destroyComputed, TrackOpTypes, TriggerOpTypes} from "rata";
import { Host } from "./Host";
import {createHost} from "./createHost";

function getSpliceRemoveLength(argv: any[], length: number) : number {
    // CAUTION 按照 mdn 的定义，splice 第二个参数如果是 undefined 但是后面又有其他参数，就会被转成 0。
    const argv1NotUndefined = argv![1] === undefined ? ( argv!.length < 2 ? Infinity : 0 ) : (argv![1] as number)
    const argv1 = argv1NotUndefined < 0 ? 0 : argv1NotUndefined
    return argv1 !== Infinity ? argv1: (length - (argv![0] as number))
}

export class ReactiveArrayHost implements Host{
    handler: FragDOMHandler
    hostsComputed?: Host[]
    placeholderAndItemComputed?: [any, Comment][]
    element: HTMLElement|Comment = this.placeholder
    constructor(public source: ReturnType<typeof computed>, public placeholder:UnhandledPlaceholder, ) {
        this.handler = new FragDOMHandler(placeholder)
    }
    createPlaceholder(item: any): [any, Comment] {
        return [item, new Comment('frag item host')]
    }
    createHost([item, placeholder] : [any, UnhandledPlaceholder]) : Host{
        return createHost(item, placeholder)
    }

    isOnlyChildrenOfParent() {
        const parent = this.placeholder.parentElement
        return parent?.lastChild === this.placeholder && (parent.firstChild as HTMLElement) === this.hostsComputed![0]?.element
    }

    render(): void {

        const mapPlaceholderItemPairToPlaceholder = ([, placeholder]: [any, UnhandledPlaceholder]) : UnhandledPlaceholder => placeholder

        this.placeholderAndItemComputed = computed(
            (trackOnce) => {
                // FIXME 这里支持不了重算，因为理论上重算需要把所有 Placeholder remove。但是placeholder 重算以为这下面的 host 也会重算，
                //  host 的重算依赖了这里产生的 placeholder，但这里 placeholder 已经 remove 了，做 dom 操作的时候就会出问题。
                trackOnce!(this.source, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                trackOnce!(this.source, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
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
                        this.handler.insertBefore(newPlaceholders, firstEl as HTMLElement|Comment)
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
                                this.handler.insertBefore(newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder), firstEl as HTMLElement|Comment)
                            } else {
                                // 加在中间了
                                const afterPlaceholder: UnhandledPlaceholder = placeholderAndItems[afterIndex][1]
                                // CAUTION 这里一定要用 insertAfter，因为 placeholder 前面是真正的元素。
                                this.handler.insertAfter(newPlaceholderAndItems.map(mapPlaceholderItemPairToPlaceholder), afterPlaceholder)
                            }
                        }

                        placeholderAndItems.splice(argv![0], argv![1], ...newPlaceholderAndItems)
                        // CAUTION 不需要处理 placeholder，因为下面的 computed 里的 Host 会处理。
                    } else if(!method && result){

                        // 没有 method 说明是 explicit_key_change 变化
                        result.add?.forEach(({ }) => {
                            // TODO 也许未来能支持，和 splice 一样，但这意味着可能中间会掺入很多 undefined，这不是常见的场景
                            throw new Error('can not use obj[key] = value to add item to reactive array, use push instead.')
                        })

                        result.update?.forEach(({ key, newValue }) => {
                            const newPlaceholderAndItem = this.createPlaceholder(newValue)
                            // CAUTION 就插在原本的那个 placeholder 后面，待会后面的 Host destroy 的时候会回收的。
                            const afterPlaceholder: UnhandledPlaceholder = placeholderAndItems[key][1]
                            this.handler.insertAfter(mapPlaceholderItemPairToPlaceholder(newPlaceholderAndItem), afterPlaceholder)
                            placeholderAndItems[key] = newPlaceholderAndItem
                        })

                        result.remove?.forEach(({  }) => {
                            // TODO delete 会变成 undefined，也是意料之外的场景
                            throw new Error('can not use delete obj[key] to delete item, use splice instead.')
                        })

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
                trackOnce!(this.placeholderAndItemComputed!, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                const hosts = this.placeholderAndItemComputed!.map(([item, placeholder]) => createHost(item, placeholder))
                hosts.forEach(host => host.render())
                return hosts
            },
            (hosts, triggerInfos) => {
                // TODO 所有的 连续添加节点的操作，都可以通过在 fragment 里面先操作，再一次性插入来提升性能！！！
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
                        // TODO 1. 针对 clear 的情况可以继续优化 dom 操作，如果当前 frag 就是  Parent 下的唯一孩子节点，可以直接
                        //  调用 replaceChildren，这比一个一个 remove 要快。
                        // if (argv![0] === 0 && argv![1] > hosts.length  && this.isOnlyChildrenOfParent()) {
                        //     destroy 参数true 表示不需要回收，除非是创建了 Portal
                            // hosts.forEach(host => host.destroy(true))

                        // } else {
                            // TODO 2. 针对 Host 的 render 也可以合并成 fragment，一次性 append 进去。
                            const newHosts = argv!.slice(2)!.map(this.createHost)
                            newHosts.forEach(host => host.render())
                            const removeLength = getSpliceRemoveLength(argv!, hosts.length)
                            const removed = hosts.splice(argv![0], removeLength, ...newHosts)
                            removed.forEach((host: Host) => host.destroy())
                        // }
                    } else if(!method && result){
                        // explicit update
                        // 没有 method 说明是 explicit_key_change 变化
                        result.add?.forEach(({ }) => {
                            throw new Error('should never occur')
                        })

                        result.update?.forEach(({ key, newValue }) => {
                            // 会自己回收之前 placeholder
                            hosts[key].destroy()
                            hosts[key] = this.createHost(newValue)
                            hosts[key].render()
                        })

                        result.remove?.forEach(({  }) => {
                            throw new Error('should never occur')
                        })
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


type ValidElementType = Comment|HTMLElement|DocumentFragment

export class FragDOMHandler {
    fragmentParent = document.createDocumentFragment()
    firstEl: HTMLElement|Comment = this.placeholder
    constructor(public placeholder:Comment) {

    }
    get parentElement() {
        return this.placeholder.parentElement || this.fragmentParent
    }
    push(...newEl: Array<HTMLElement|Comment>) {
        if (!newEl.length) return

        if (this.firstEl === this.placeholder) this.firstEl = newEl[0]

        const frag = document.createDocumentFragment()
        frag.replaceChildren(...newEl)
        insertBefore(frag, this.placeholder)
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
            this.firstEl = firstEl.nextSibling! as HTMLElement|Comment
            firstEl.remove()
        }
    }
    unshift(...newEl: Array<HTMLElement|Comment>) {
        if (!newEl.length) return

        const frag = document.createDocumentFragment()
        frag.replaceChildren(...newEl)
        insertBefore(frag, this.firstEl as HTMLElement)

        this.firstEl = newEl[0]
    }
    splice(startIndex: number, length?: number, ...newEl: ValidElementType[]) {
        if (length === 0) return

        let pointer = this.firstEl
        let startCount = 0
        while(startCount < startIndex && pointer !== this.placeholder) {
            pointer = pointer.nextSibling! as HTMLElement|Comment
            startCount++
        }

        const endLength = length || (this.placeholder.parentElement!.childNodes.length - startIndex)

        let count = 0
        while(pointer !== this.placeholder && count < endLength) {
            const current = pointer
            pointer = current.nextSibling! as HTMLElement|Comment
            current.remove()
            count++
        }

        const frag = document.createDocumentFragment()
        frag.replaceChildren(...newEl)
        insertBefore(frag, pointer as HTMLElement)


        if (startIndex === 0) {
            this.firstEl = (newEl.length ? newEl[0] : pointer) as HTMLElement|Comment
        }
    }
    replace(...newEl: ValidElementType[]) {
        return this.splice(0, Infinity, ...newEl)
    }
    insertAfter(newEl:ValidElementType|ValidElementType[], refNode:ChildNode) {
        let toInsert: Comment|DocumentFragment|HTMLElement
        if (Array.isArray(newEl) ) {
            toInsert = document.createDocumentFragment()
            toInsert.replaceChildren(...newEl)
        } else {
            toInsert = newEl
        }

        return insertBefore(toInsert, refNode.nextSibling! as HTMLElement)
    }
    insertBefore(newEl:ValidElementType|ValidElementType[], refNode:HTMLElement|Comment) {
        let toInsert: ValidElementType
        if (Array.isArray(newEl) ) {
            toInsert = document.createDocumentFragment()
            toInsert.replaceChildren(...newEl)
        } else {
            toInsert = newEl as HTMLElement
        }
        return insertBefore(toInsert, refNode as HTMLElement)
    }

    detach() {
        let pointer = this.firstEl
        while(pointer !== this.placeholder) {
            const current = pointer
            pointer = current.nextSibling! as HTMLElement|Comment
            this.fragmentParent.appendChild(current)
        }

        this.fragmentParent.appendChild(this.placeholder)
    }
    // TODO destroy? 里面的 computed 是需要显式的 destroy 才会  stop 的

}