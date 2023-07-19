import {createElement} from "@framework";
import { default as G6, Graph as G6Graph, GraphOptions, IEdge, INode} from '@antv/g6'
import {Atom, computed, incIndexBy, incMap, isReactive, TrackOpTypes, TriggerOpTypes} from "rata";


type Node = {
    [k: string]: any,
    id: Atom<string>
}
type Edge = {
    [k: string]: any,
    id: Atom<string>
}


G6.registerNode('rect-node', {
    // draw anchor-point circles according to the anchorPoints in afterDraw
    afterDraw(cfg, group) {
        // CAUTION 因为添加了节点之后，肯定都会要从 dom 同步一次宽高，所以 afterDraw 这里没有必要执行了。
        // const bbox = group!.getBBox();
        // const anchorPoints = this.getAnchorPoints(cfg)
        // anchorPoints.forEach((anchorPos, i) => {
        //     group.addShape('circle', {
        //         attrs: {
        //             r: 5,
        //             x: bbox.x + bbox.width * anchorPos[0],
        //             y: bbox.y + bbox.height * anchorPos[1],
        //             fill: '#fff',
        //             stroke: '#5F95FF'
        //         },
        //         // must be assigned in G6 3.3 and later versions. it can be any string you want, but should be unique in a custom item type
        //         name: `anchor-point`, // the name, for searching by group.find(ele => ele.get('name') === 'anchor-point')
        //         anchorPointIdx: i, // flag the idx of the anchor-point circle
        //         links: 0, // cache the number of edges connected to this shape
        //         visible: false, // invisible by default, shows up when links > 1 or the node is in showAnchors state
        //         draggable: true // allow to catch the drag events on this shape
        //     })
        // })
    },
    afterUpdate(cfg, node) {
        const group = node?.getContainer()
        const anchors = node.getContainer().findAll(ele => ele.get('name') === 'anchor-point');
        anchors.forEach(anchor => anchor.remove())

        // TODO 改成调整位置？不需要每次都生成？
        const bbox = group!.getBBox();
        const anchorPoints = this.getAnchorPoints(cfg)

        anchorPoints.forEach((anchorPos, i) => {
            group.addShape('circle', {
                attrs: {
                    r: 5,
                    x: bbox.x + bbox.width * anchorPos[0],
                    y: bbox.y + bbox.height * anchorPos[1],
                    fill: '#fff',
                    stroke: '#5F95FF'
                },
                // must be assigned in G6 3.3 and later versions. it can be any string you want, but should be unique in a custom item type
                name: `anchor-point`, // the name, for searching by group.find(ele => ele.get('name') === 'anchor-point')
                anchorPointIdx: i, // flag the idx of the anchor-point circle
                links: 0, // cache the number of edges connected to this shape
                visible: false, // invisible by default, shows up when links > 1 or the node is in showAnchors state
                draggable: true // allow to catch the drag events on this shape
            })
        })
    },
    getAnchorPoints(cfg) {
        return cfg.anchorPoints || [[0, 0.5], [0.33, 0], [0.66, 0], [1, 0.5], [0.33, 1], [0.66, 1]];
    },
    // response the state changes and show/hide the link-point circles
    setState(name, value, item) {
        if (name === 'showAnchors') {
            const anchorPoints = item.getContainer().findAll(ele => ele.get('name') === 'anchor-point');
            anchorPoints.forEach(point => {
                if (value || point.get('links') > 0) point.show()
                else point.hide()
            })
        }
    }
}, 'rect')




class XGraph {
    public graph: G6Graph
    nodeComputed: ReturnType<typeof computed>
    edgeComputed: ReturnType<typeof computed>
    public nodeToGraphNode = new Map<any, INode>()
    public nodeToDOMNode = new Map<any, HTMLElement>()
    public edgeToGraphEdge = new Map<any, IEdge>()
    public edgeToDOMNode = new Map<any, HTMLElement>()
    public resizeObserver: ResizeObserver
    public componentContainer: HTMLElement
    public graphContainer:HTMLElement
    constructor(public options: Omit<GraphOptions, 'container'>, public nodes: Node[], public edges: any[], public Component: (any) => JSX.Element, public Edge: (any) => JSX.Element) {

    }
    drawGraph() {
        this.graph = new G6Graph({ ...this.options, container: this.graphContainer })
        this.linkNodesAndGraphPlaceholder()
        this.linkGraphPlaceholderPositionAndNode()

        this.linkEdgeAndGraphLabel()
        this.listenCreateEdge()
        this.listenAnchorEvents()
    }
    listenAnchorEvents() {
        this.graph.on('node:mouseenter', e => {
            this.graph.setItemState(e.item!, 'showAnchors', true);
        })
        this.graph.on('node:mouseleave', e => {
            this.graph.setItemState(e.item!, 'showAnchors', false);
        })
        this.graph.on('node:dragenter', e => {
            this.graph.setItemState(e.item!, 'showAnchors', true);
        })
        this.graph.on('node:dragleave', e => {
            this.graph.setItemState(e.item!, 'showAnchors', false);
        })
        this.graph.on('node:dragstart', e => {
            this.graph.setItemState(e.item!, 'showAnchors', true);
        })
        this.graph.on('node:dragout', e => {
            this.graph.setItemState(e.item!, 'showAnchors', false);
        })
    }
    listenCreateEdge() {
        this.graph.on('aftercreateedge', (event) => {
            debugger

        })
    }
    render() {
        this.graphContainer = <div style={{position:'absolute', top:0, left:0, width: '100%', height: '100%' }}></div> as HTMLElement

        const { Component, Edge } = this
        const nodeAndDOMNodes = incMap(this.nodes, (node) => ({node, dom: <div style={{display:'inline-block', position:'absolute'}}><Component node={node}/></div> }))
        this.nodeToDOMNode = incIndexBy(nodeAndDOMNodes, 'node', ({dom}) => dom) as Map<string, HTMLElement>
        const edgeAndDOMNodes = incMap(this.edges, (edge) => ({edge, dom: <div style={{display:'inline-block', position:'absolute'}}><Edge edge={edge}/></div> }))
        this.edgeToDOMNode = incIndexBy(edgeAndDOMNodes, 'edge', ({dom}) => dom) as Map<string, HTMLElement>

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // TODO update placehoder 的尺寸
                console.log(entry.borderBoxSize)
            }
            console.log("Size changed");
        });

        return <div style={{position: 'relative', border: '1px blue dashed', width: this.options.width, height: this.options.height}}>
            <div style={{position:'absolute', width: 0, height:0, left: 0, top:0, overflow:'visible'}}>
                {incMap(nodeAndDOMNodes, ({ dom }) => dom)}

            </div>
            {this.graphContainer}
            <div style={{position:'absolute', width: 0, height:0, left: 0, top:0, overflow:'visible'}}>
                {incMap(edgeAndDOMNodes, ({ dom }) => dom)}
            </div>
        </div>
    }
    createPlaceholder(node: Node): Parameters<typeof this.graph.addItem> {
        return [
            'node',
            {
                id: node.id(),
                raw: node,
                type: 'rect-node',
                x: node.x(),
                y: node.y(),
                style: {
                    opacity: 0,
                    stroke: '#ccc',
                },
                anchorPoints: [
                    [.5, 0],
                    [.5, 1],
                    [1, .5],
                    [0, .5],
                ]
            }
        ]
    }
    addPlaceholder(node: Node) {
        const graphNode = this.graph.addItem(...this.createPlaceholder(node))
        this.nodeToGraphNode.set(node, graphNode as INode)

        const domNode = this.nodeToDOMNode.get(node)
        this.resizeObserver.observe(domNode)
        this.syncDOMSize(node)
    }
    syncDOMSize(node) {
        const domNode = this.nodeToDOMNode.get(node)
        const graphNode = this.nodeToGraphNode.get(node)
        const width = domNode.clientWidth
        const height = domNode.clientHeight
        graphNode.update({style: { height, width }}, 'style')
    }
    syncDOMPos(node) {
        const graphNode = this.nodeToGraphNode.get(node)
        const dom = this.nodeToDOMNode.get(node)
        const box = graphNode.getBBox()
        dom.style.top = `${box.y}px`
        dom.style.left = `${box.x}px`
    }
    removePlaceholder(node: any) {
        const graphNode = this.nodeToGraphNode.get(node)
        this.graph.removeItem(graphNode)

        const domNode = this.nodeToDOMNode.get(node)
        this.resizeObserver.unobserve(domNode)
    }
    linkGraphPlaceholderPositionAndNode() {
        this.nodes.forEach(node => {
            this.syncDOMPos(node)
        })

        this.graph.on('node:dragend', (event) => {
            const node = event.item as INode
            this.syncDOMPos(node!.getModel().raw)
            // 关联 edge label 也要重算
            node.getEdges().forEach(graphEdge => {
                this.syncEdgeLabelPos(graphEdge.getModel().raw)
            })
        });
    }
    linkNodesAndGraphPlaceholder() {
        this.nodeComputed = computed(
            (track) => {
                track!(this.nodes, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(this.nodes, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return this.nodes.forEach((node: any, index) => this.addPlaceholder(node))
            },
            (data, triggerInfos) => {
                triggerInfos.forEach(({ method , argv, result}) => {
                    if(!method && !result) throw new Error('trigger info has no method and result')
                    if (method === 'push' || method === 'shift') {
                        result!.add!.forEach(({key, newValue}) => {
                            this.addPlaceholder(newValue)
                        })
                    } else if (method === 'pop' || method === 'shift') {
                        result!.remove!.forEach(({key, oldValue}) => {
                            this.removePlaceholder(oldValue)
                        })
                    } else if (method === 'splice' || !method) {
                        result!.add?.forEach(({key, newValue}) => {
                            this.addPlaceholder(newValue)
                        })
                        result!.update?.forEach(({key, oldValue, newValue}) => {
                            this.removePlaceholder(oldValue)
                            this.addPlaceholder(newValue)
                        })
                        result!.remove?.forEach(({key, oldValue}) => {
                            this.removePlaceholder(oldValue)
                        })
                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            }
        )
    }
    createLabel(edge): Parameters<typeof this.graph.addItem> {
        return [
            'edge',
            {
                type: 'polyline',
                raw: edge,
                id: edge.id(),
                source: edge.source(),
                target : edge.target(),
                style: {
                    endArrow: true,
                }
            }
        ]
    }
    addLabel(edge) {
        const graphEdge = this.graph.addItem(...this.createLabel(edge))
        this.edgeToGraphEdge.set(edge, graphEdge as IEdge)
        this.syncEdgeLabelPos(edge)
    }
    syncEdgeLabelPos(edge) {
        const graphEdge = this.edgeToGraphEdge.get(edge)
        const domNode = this.edgeToDOMNode.get(edge)
        const box = graphEdge.getKeyShape().getPoint(0.5)
        domNode.style.left = `${box.x}px`
        domNode.style.top = `${box.y}px`
    }
    removeLabel(edge) {
        const graphEdge = this.edgeToGraphEdge.get(edge)
        this.graph.removeItem(graphEdge)
    }
    linkEdgeAndGraphLabel() {
        this.edgeComputed = computed(
            (track) => {
                track!(this.nodes, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(this.nodes, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return this.edges.forEach((edge,) => this.addLabel(edge))
            },
            (data, triggerInfos) => {
                triggerInfos.forEach(({ method , argv, result}) => {
                    if(!method && !result) throw new Error('trigger info has no method and result')
                    if (method === 'push' || method === 'shift') {
                        result!.add!.forEach(({key, newValue}) => {
                            this.addLabel(newValue)
                        })
                    } else if (method === 'pop' || method === 'shift') {
                        result!.remove!.forEach(({key, oldValue}) => {
                            this.removeLabel(oldValue)
                        })
                    } else if (method === 'splice' || !method) {
                        result!.add?.forEach(({key, newValue}) => {
                            this.addLabel(newValue)
                        })
                        result!.update?.forEach(({key, oldValue, newValue}) => {
                            this.removeLabel(oldValue)
                            this.addLabel(newValue)
                        })
                        result!.remove?.forEach(({key, oldValue}) => {
                            this.removeLabel(oldValue)
                        })
                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            }
        )
    }

}


export type GraphType = { options: object, nodes: [], edges: [], Component: (any) => JSX.Element, Edge: (any) => JSX.Element }
export function Graph( { options, nodes, edges, Component, Edge} : GraphType) {
    const graph = new XGraph(options, nodes, edges, Component, Edge);
    setTimeout(() => {
        graph.drawGraph()
    }, 1)
    return graph.render()
}
