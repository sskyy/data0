

import {createElement} from "@framework";
import { InteractionNode } from "./InteractionNode";
import {Graph} from "../graph/graph";
import {atom, computed, incMap, reactive} from "rata";
import {GraphOptions} from "@antv/g6";
import {InteractionEdge} from "./InteractionEdge";
import {Action, Activity, Interaction, InteractionGroup, Role, Transfer} from "./InteractionClass";
import {ActivityNode} from "./AcitivityNode";
import hotkeys from "hotkeys-js";
import {service} from "../service";


const _nodes = reactive([{
    id: crypto.randomUUID(),
    x: 100,
    y: 200,
}, {
    id: crypto.randomUUID(),
    x: 100,
    y: 300,
}, {
    id: crypto.randomUUID(),
    x: 100,
    y: 400,
}])



const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    role: Role.createReactive({ name: 'User'}),
    action: Action.createReactive({ name: 'sendRequest'})
})

const responseGroup = InteractionGroup.createReactive({
    type: 'or',
    interactions: [
        Interaction.createReactive({
            name: 'approve',
            role: Role.createReactive({ name: 'User'}),
            action: Action.createReactive({ name: 'approve'})
        }),
        Interaction.createReactive({
            name: 'reject',
            role: Role.createReactive({ name: 'User'}),
            action: Action.createReactive({ name: 'reject'})
        }),
        Interaction.createReactive({
            name: 'cancel',
            role: Role.createReactive({ name: 'User'}),
            action: Action.createReactive({ name: 'cancel'})
        }),
    ]
})

const _activity: Activity = {
    interactions: [
        sendInteraction
    ],
    groups: [
        responseGroup
    ],
    transfers: [
        Transfer.createReactive({
            name: 'fromSendToResponse',
            source: sendInteraction,
            target: responseGroup
        })
    ]
}

export function ActivityGraph({ activity = _activity }) {
    // TODO concat 如何仍然保持 incremental ?
    const nodes = computed(() => {
        return activity.interactions.map(interaction => ({ id: interaction.uuid, raw: interaction })).concat(
            activity.groups.map( group => ({ id: group.uuid, raw: group, isGroup: true }))
        )
    })


    const edges = incMap(activity.transfers, transfer => ({
        id: crypto.randomUUID(),
        source: transfer.source().uuid,
        target: transfer.target().uuid
    }))


    let sourceAnchorIdx, targetAnchorIdx;
    const options: Omit<GraphOptions, 'container'> = {
        width: 800,
        height: 800,
        fitView: true,
        fitCenter: true,
        layout: {
            type: 'dagre',
            ranksep: 80,
            rankdir: 'TB',
            // TODO align center 现在无效
            align: undefined
        },
        modes: {
            // default: ['drag-canvas'],
            default: [
                'click-select',
                'drag-combo',
                {
                    type: 'drag-node',
                    shouldBegin: e => {
                        if (e.target.get('name') === 'anchor-point') return false;
                        return true;
                    }
                },
                {
                    type: 'create-edge',
                    trigger: 'drag', // set the trigger to be drag to make the create-edge triggered by drag
                    shouldBegin: e => {
                        // avoid beginning at other shapes on the node
                        if (e.target && e.target.get('name') !== 'anchor-point') return false;
                        sourceAnchorIdx = e.target.get('anchorPointIdx');
                        e.target.set('links', e.target.get('links') + 1); // cache the number of edge connected to this anchor-point circle
                        return true;
                    },
                    shouldEnd: e => {
                        // avoid ending at other shapes on the node
                        if (e.target && e.target.get('name') !== 'anchor-point') return false;
                        if (e.target) {
                            targetAnchorIdx = e.target.get('anchorPointIdx');
                            e.target.set('links', e.target.get('links') + 1);  // cache the number of edge connected to this anchor-point circle
                            return true;
                        }
                        targetAnchorIdx = undefined;
                        return true;
                    }
                }
            ],
            edit: ['click-select', 'drag-combo', 'drag-node', 'create-edge'],
        },
        defaultEdge: {
            type: 'polyline',
            style: {
                endArrow: true,
            }

        }
    }

    const listeners = {
        'canvas:dblclick': () => {
            console.log(111)
            isEditingNode(true)
        }
    }

    const isEditingNode = atom(false)

    hotkeys('cmd+s', (e) => {
        service.writeFile('app/test.json', JSON.stringify(nodes))
        e.preventDefault()
    })

    hotkeys('esc', (e) => {
        if (isEditingNode()) {
            isEditingNode(false)
        }
        e.preventDefault()
    })


    return <Graph options={options} nodes={nodes} edges={edges} Component={ActivityNode} isEditingNode={isEditingNode} Edge={InteractionEdge} canvasEventListeners={listeners}/>
}