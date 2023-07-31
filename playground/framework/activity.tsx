/* @jsx createElement*/
import {createElement, createRoot} from "@framework";
import "./index.css"
import {ActivityGraph} from "./component/activity/ActivityGraph";




const root = createRoot(document.getElementById('root')!)
root.render(<ActivityGraph />)

