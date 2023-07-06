/* @jsx createElement*/
import {createElement} from "../../src/render";
import {Entity, Property, PropertyTypes} from "./Entity";
import {Atom, incMap} from 'rata'


type columnProp = {
    entity: Entity,
    index: Atom<number>,
    opener?: { entity: Entity, prop: Property}
    openEntity: (prop: Property) => void
}

export function Column({ entity, opener, openEntity } : columnProp) {

    const openRelatedEntity = (prop: Property) => {
        if ( prop.type === PropertyTypes.Relation ) {
            openEntity(prop)
        }
    }

    return (
        <div>
            <h1>[{entity.name}]</h1>
            {incMap(entity.properties, (property: Property) => (
                <div onClick={() => openRelatedEntity(property)}>
                    <span>{property.name}</span>
                    <span>{property.type === PropertyTypes.Relation ? '[Rel]' : '' }</span>
                </div>
            ))}
        </div>
    )

}