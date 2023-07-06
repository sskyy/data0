import {reactive, Atom, atom} from 'rata'


export enum PropertyTypes {
    String = 'string',
    Number = 'number',
    Relation = 'relation'
}

class PropertyTypeArg {}

export class RelationPropertyTypeArg extends PropertyTypeArg{
    public target: { entity: Entity, prop: Property}
    constructor(target: { entity: Entity, prop: Property}) {
        super();
        this.target = reactive(target)
    }
}


export class Property {
    public propertyArg?: PropertyTypeArg
    public name: Atom<string>
    constructor(name: string, public type: PropertyTypes) {
        // type 是不能改的，要改就等于新建一个。
        this.name = atom(name)
    }
}

export class Entity {
    public name: Atom<string>
    public properties: Property[] = []
    constructor(name: string) {
        this.name = atom(name)
    }
}


