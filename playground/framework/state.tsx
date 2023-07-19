/* @jsx createElement*/
import {createElement} from "@framework";
import {atom, reactive} from "rata";
import {EREditor} from "./component/entity/EREditor";
import {Entity, Property, PropertyTypes, Relation} from "./component/entity/Entity";
import "./index.css"
import {createRoot} from "./src/render";
import {createInstancesFromString, stringifyAllInstances} from "./component/createClass";
import {StateMachine} from "./component/stateMachine/StateMachine";




const root = createRoot(document.getElementById('root')!)
root.render(<div>
    <h1>test</h1>
    <StateMachine />
</div>)


