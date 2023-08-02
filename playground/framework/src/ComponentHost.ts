import {reactive, pauseTracking, resetTracking, isReactive} from "rata";
import {UnhandledPlaceholder, createElement, JSXElementType, AttributesArg} from "./DOM";
import {Context, Host} from "./Host";
import {createHost} from "./createHost";
import {Component, ComponentNode, EffectHandle, Props} from "../global";
import {assert} from "./util";


const componentRenderFrame: ComponentHost[] = []

export function onDestroy(destroyCallback: () => any) {
    componentRenderFrame.at(-1)!.destroyCallback.add(destroyCallback)
}


function ensureArray(o: any) {
    return o ? (Array.isArray(o) ? o : [o]) : []
}

type DestroyCallback = () => any

// CAUTION 为了性能，直接 assign。在底层 所有 DOM 节点都可以接受 array attribute，这样就为属性的覆盖和合并减轻了工作量。
function combineProps(origin:{[k:string]: any}, newProps: {[k:string]: any}) {
    Object.entries(newProps).forEach(([key, value]) => {
        const originValue = origin[key]
        origin[key] = ensureArray(originValue).concat(value)
    })
    return origin
}

export class ComponentHost implements Host{
    type: Component
    innerHost?: Host
    props: Props
    public layoutEffects = new Set<EffectHandle>()
    public destroyCallback = new Set<DestroyCallback>()
    public layoutEffectDestroyHandles = new Set<Exclude<ReturnType<EffectHandle>, void>>()
    public ref: {[k:string]: any} = reactive({})
    public config? : Config
    public children: any

    constructor({ type, props, children }: ComponentNode, public placeholder: UnhandledPlaceholder, public context: Context) {
        this.type = type
        this.props = props
        if(children[0] instanceof Config) {
            this.config = children[0]
        } else {
            this.children = children
        }
    }
    get parentElement() {
        return this.placeholder.parentElement
    }
    // CAUTION innerHost 可能是动态的，所以 element 也可能会变，因此每次都要实时去读
    get element() : HTMLElement|Comment|SVGElement|Text {
        return this.innerHost?.element || this.placeholder
    }

    createElement = (type: JSXElementType, rawProps : AttributesArg, ...children: any[]) : ReturnType<typeof createElement> => {
        const isComponent = typeof type === 'function'
        if(__DEV__) {
            if (!isComponent && rawProps)
                Object.entries(rawProps).forEach(([key, value]) => {
                    assert(!isReactive(value), `don't use reactive or computed for attr: ${key}, simply use function or atom`)
                })
        }

        let name = ''
        if (rawProps) {
            Object.keys(rawProps).some(key => {
                if (key[0] === '$') {
                    name = key.slice(1, Infinity)
                    // 为了性能，直接使用了 delete
                    delete rawProps[key]
                    return true
                } else  if (key === 'ref') {
                    name = rawProps[key]
                    delete rawProps[key]
                    return true
                }
            })
        }


        let finalProps = rawProps
        let finalChildren = children
        if (name && this.config?.items[name]) {


            // 为了性能，又直接操作了 rawProps
            const thisItemConfig = this.config!.items[name]
            if (thisItemConfig.props) {

                if (isComponent) {
                    // 如果是个 component，它的 props 无法自动合并，所以用户要自己处理
                    assert(typeof thisItemConfig.props === 'function', 'configure a component node must use function to handle props rewrite')
                    finalProps = (thisItemConfig.props as FunctionProp)(rawProps)
                } else {
                    // CAUTION 普通节点，这里默认适合原来的 props 合并，除非用户想要自己的处理
                    if (typeof thisItemConfig.props === 'function') {
                        finalProps = thisItemConfig.props(rawProps)
                    } else {
                        finalProps = combineProps(rawProps, thisItemConfig.props)
                        // if (name === 'container') console.log(thisItemConfig.props, rawProps)
                    }
                }

            }

            if (thisItemConfig.eventTarget) {
                // TODO 支持 eventTarget，用户
                thisItemConfig.eventTarget.forEach(eventTarget => {
                    eventTarget((e: Event) => {
                        this.eventTargetTrigger(e, name)
                    })
                })

            }


            // 支持 children 和 configure 同时存在
            if (thisItemConfig.children) {
                if (isComponent) {
                    // 支持对 InnerComponent 的穿透 configure
                    finalChildren = [configure(thisItemConfig.children)]
                } else {
                    finalChildren = thisItemConfig.children
                }
            }
        }

        if (name && isComponent) {
            finalProps.ref = (host: Host) => this.ref[name] = host
        }
        const el = createElement(type, finalProps, ...finalChildren)

        if (name && !isComponent) {
            this.ref[name] = el
        }
        return el
    }
    eventTargetTrigger = (sourceEvent: Event, targetName: string) => {
        // TODO 如何 clone 各种不同的 event ? 这里的暴力方式是否ok
        const EventConstructor = sourceEvent.constructor as typeof Event
        const targetEvent = new EventConstructor(sourceEvent.type, sourceEvent)
        // console.log(`dispatching ${targetName} ${targetEvent.type} ${targetEvent.key}`)
        // CAUTION 因为 keydown 等 event 是无法通过 node.dispatchEvent 模拟的，所以这里我们直接用 DOM 的 eventProxy 实现。
        this.ref[targetName].dispatchEvent( targetEvent)
    }

    useLayoutEffect = (callback: EffectHandle) => {
        this.layoutEffects.add(callback)
    }

    // TODO 需要用 computed 限制一下自己的变化范围？？？
    render(): void {
        if (this.element !== this.placeholder) {
            // CAUTION 因为现在没有 diff，所以不可能出现 Component rerender
            assert(false, 'should never rerender')
        }
        componentRenderFrame.push(this)

        const props = {...this.props}
        // CAUTION 注意这里 children 的写法，没有children 就不要传，免得后面 props 继续往下透传的时候出问题。
        if (this.children) props.children = this.children
        // CAUTION 组件在渲染的时候只是为了建立联系，这种过程可能会读 reactive，但不应该被更上层监听。
        //  组件的渲染会出现在 FunctionHost 中，并且是在 FunctionHost render 的 computed 中，所以这里 render 中的读的值都可能会被上层 track.
        pauseTracking()
        const node = this.type(props, {createElement: this.createElement, ref: this.ref, useLayoutEffect: this.useLayoutEffect, context: this.context})

        componentRenderFrame.pop()
        // 就用当前 component 的 placeholder
        this.innerHost = createHost(node, this.placeholder, this.context)
        this.innerHost.render()
        resetTracking()

        // CAUTION 一定是渲染之后才调用 ref，这样才能获得 dom 信息。
        if (this.props.ref) {
            assert(typeof this.props.ref === 'function', `ref on component should be a function after parent component handled`)
            this.props.ref(this)
        }

        // TODO 理论上要有个通知挂载的事件时才执行。虽然组件 render，但未来可能为了一些其他原因会延迟挂载到 document 上。
        this.layoutEffects.forEach(layoutEffect => {
            const handle = layoutEffect()
            if (handle) this.layoutEffectDestroyHandles.add(handle)
        })
    }
    destroy(parentHandle?: boolean) {
        this.innerHost!.destroy(parentHandle)
        this.layoutEffectDestroyHandles.forEach(handle => handle())
        this.destroyCallback.forEach(callback => callback())
        if (!parentHandle) {
            this.placeholder.remove()
        }
    }
}

type FunctionProp = (arg:any) => object
type EventTarget = (arg: (e:Event) => any) => void

type ConfigItem = {
    eventTarget?: EventTarget[],
    props?: object|FunctionProp,
    children?: any
}

class Config {
    constructor(public items: {[k:string]:ConfigItem}) {}
}

export function configure(items: {[k:string]:ConfigItem}) {
    return new Config(items)
}