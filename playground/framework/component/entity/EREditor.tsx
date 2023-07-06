/* @jsx createElement*/
import {createElement} from "../../src/render";
import {Entity, Property, RelationPropertyTypeArg} from "./Entity";
import {reactive, incMap} from 'rata'
import {Column} from "./Column";

type EREditorProps = {
    entities: Entity[]
}

type ColumnData = {entity: Entity, opener?: { entity: Entity, prop: Property}}


export function EREditor({ entities }: EREditorProps) {
    const columns: ColumnData[] = reactive([])


    const onChooseEntity = (entity: Entity) => {
        columns.splice(0, undefined, { entity })
    }

    const openEntity = (entity: Entity, relationProp: Property, index: number) => {
        columns.splice(index+1, Infinity, {
            entity: (relationProp.propertyArg as RelationPropertyTypeArg).target.entity,
            opener: {
                entity,
                prop: relationProp
            }
        })
    }

    return <div>
        <h1>ER Editor</h1>
        <div>
            {incMap(entities, (entity: Entity) => (
                <div onClick={() => onChooseEntity(entity)}>{entity.name}</div>
            ))}
        </div>
        <div>
            {incMap(columns, (data: ColumnData, index) => {
                return (
                    <Column {...data} openEntity={(prop) => openEntity(data.entity, prop, index)}/>
                )
            })}
        </div>
    </div>
}
