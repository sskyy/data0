import {createElement} from "@framework";
import {AttributiveInput} from "./AttributiveInput";
import {RoleInput} from "./RoleInput";
import {PayloadInput} from "./PayloadInput";
import {Select} from "../form/Select";
import {ActionInput} from "./ActionInput";

export function Interaction({ interaction }){
    return (
        <div>
            <div>
                <AttributiveInput/>
                {/*<RoleInput />*/}
                <span>User</span>
            </div>
            <div>
                <ActionInput />
            </div>
            <div>
                <PayloadInput />
            </div>
        </div>
    )
}
