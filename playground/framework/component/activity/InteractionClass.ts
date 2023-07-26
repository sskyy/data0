import {createClass, getInstance} from "../createClass";
import {Atom, computed, incPick, incUnique} from "rata";
import {Entity} from "../entity/Entity";

export const Role = createClass({
    name: 'Role',
    display: (obj) => obj.name,
    public: {
        name: {
            type: 'string',
            required: true,
            constraints: {
                format({ name } : {name:Atom<string>}) {
                    return computed(() => validNameFormatExp.test(name))
                },
            }
        }
    }
})

export const RoleAttributive = createClass({
    name: 'RoleAttributive',
    public: {
        name: {
            type: 'string',
            // TODO name unique
        },
        // TODO content 是个复合结构
        // content: {
        //     type: 'string',
        // },
        stringContent: {
            type: 'string',
            required: true,
            // TODO 必须是合法的 function 代码
        },
        base: {
            type: Role,
            options: () => {
                return getInstance(Role)
            }
        }
    }
})

export const EntityAttributive = createClass({
    name: 'EntityAttributive',
    public: {
        name: {
            type: 'string',
        },

        base: Entity
    }
})

const validNameFormatExp = /^[a-z(A-Z0-9_]+$/



export const Action = createClass({
    name: 'Action',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

// TODO Attributive 和 Payload 都是动态类型的怎么表达啊？？？
export const Payload = createClass({
    name: 'Payload'
})

export const constraints = {
    actionNameUnique() {
        const actions = getInstance(Action)
        const uniqueNames = incUnique(incPick(actions, '$name'))
        return computed(() => uniqueNames.size === actions.length)
    },
    roleNameUnique() {
        const roles = getInstance(Role)
        const uniqueNames = incUnique(incPick(roles, '$name'))
        return computed(() => uniqueNames.size === roles.length)
    }
}

export const Interaction = createClass({
    name:'Interaction',
    display: (obj) => `${obj.action.name}`,
    public: {
        name: {
          type: 'string',
          required: true
        },
        roleAttributive: {
            type: RoleAttributive,
        },
        role : {
            type: Role,
            required: true
        },
        action:  {
            type: Action,
            required: true
        },
        payload: Payload
    }
})


export const InteractionGroup = createClass({
    name: 'InteractionGroup',
    public: {
        type: {
            type: 'string',
            required: true
        },
        interactions: {
            type: Interaction,
            collection: true
        }
    }
})

export const Gateway = createClass({
    name: 'Gateway',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

export const Transfer = createClass({
    name: 'Transfer',
    public: {
        name: {
            type: 'string',
            required: true
        },
        source: {
            type: Interaction,
            required: true
        },
        target: {
            type: [Interaction, InteractionGroup],
            required: true
        }
    }
})

export const Event = createClass({
    name: 'Event',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

export const SideEffect = createClass({
    name: 'SideEffect',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})

export const Activity = createClass({
    name: 'Activity',
    public: {
        interactions: {
            type: Interaction,
            collection: true
        },
        gateways: {
            type: Gateway,
            collection: true
        },
        transfers: {
            type: Transfer,
            collection: true
        },
        groups: {
            type: InteractionGroup,
            collection: true
        },
        events: {
            type: Event,
            collection: true
        },
        sideEffects: {
            type: SideEffect,
            collection: true
        },
    }
})