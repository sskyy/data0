/* @jsx createElement*/
import {createElement, createRoot} from "./src/render";
import {reactive} from "rata";
import {EREditor} from "./component/entity/EREditor";
import {Entity, Property, PropertyTypes, RelationPropertyTypeArg} from "./component/entity/Entity";


const userEntity = new Entity('User')

const nameProperty = new Property('name', PropertyTypes.String)
const fileProperty = new Property('files', PropertyTypes.Relation)
userEntity.properties = [
    nameProperty,
    fileProperty,
]

const fileEntity = new Entity('File')
const filenameProperty = new Property('name', PropertyTypes.String)
const ownerProperty = new Property('owner', PropertyTypes.Relation)
ownerProperty.propertyArg = new RelationPropertyTypeArg({entity: userEntity, prop: fileProperty})
const machineProperty = new Property('machine', PropertyTypes.Relation)

fileEntity.properties = [
    filenameProperty,
    ownerProperty,
    machineProperty
]

// 双向链接
fileProperty.propertyArg = new RelationPropertyTypeArg({entity: fileEntity, prop: ownerProperty})



const machineEntity = new Entity('Machine')
const machineNameProperty = new Property('name', PropertyTypes.String)
const machineFileProperty = new Property('localFiles', PropertyTypes.Relation)
machineEntity.properties = [
    machineNameProperty,
    machineFileProperty,
]

machineFileProperty.propertyArg = new RelationPropertyTypeArg({entity: fileEntity, prop: machineProperty})
machineProperty.propertyArg = new RelationPropertyTypeArg({entity: machineEntity, prop: machineFileProperty})

const entities: Entity[] = reactive([userEntity, fileEntity, machineEntity])



const root = createRoot(document.getElementById('root'))
root.render(<EREditor entities={entities}/>)
