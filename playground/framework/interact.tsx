/* @jsx createElement*/
import {createElement, createRoot} from "@framework";
import "./index.css"
import {InteractionNode} from "./component/activity/InteractionNode";


const root = createRoot(document.getElementById('root')!)
root.render(<InteractionNode />)


