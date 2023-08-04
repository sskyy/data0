import '../code/useWorker';
import {InjectHandles, Props} from "../../global";
import {computed, incConcat, incMap} from "rata";
import {AttributiveInput} from "./AttributiveInput";
import {Checkbox} from "../form/Checkbox";
import {Input} from "../form/Input";
import {createDraftControl} from "../createDraftControl";
import {EntityAttributive, PayloadItem, Role, RoleAttributive} from "./InteractionClass";
import {Button} from "../form/Button";
import {Select} from "../form/Select";

export function PayloadInput({ value, errors, roles, entities, roleAttributives, entityAttributives, selectedAttributive}: Props, { createElement }: InjectHandles) {

    // TODO 怎么表示添加新的？？？我们只做了 draft，就是 create 一个新的？？

    const onAddClick = () => {
        value().items.push(PayloadItem.createReactive({ name: '', base: null, attributive: null }))
    }

    return <div>
        {incMap(value().items, (item) => {

            const renderNameDraftControl = createDraftControl(Input)
            const renderConceptDraftControl = createDraftControl(Select)
            const renderIsRefDraftControl = createDraftControl(Checkbox)
            const renderIsCollectionDraftControl = createDraftControl(Checkbox)

            const attributiveOptions = computed(() => {
                return Role.is(item.base()) ? roleAttributives : entityAttributives
            })

            // FIXME attributive 是动态的，需要更好地表达方式 例如 item.attributive.fromComputed(computed(xxx))
            computed(() => {
                if (item.base()) {
                    item.attributive(
                        Role.is(item.base()) ? RoleAttributive.createReactive({}) : EntityAttributive.createReactive({})
                    )
                }
            })


            return (
                <div>
                    {renderNameDraftControl({
                        value: item.name,
                        placeholder: 'key'
                    })}
                    <span>:</span>
                    <AttributiveInput value={item.attributive} options={attributiveOptions} selectedAttributive={selectedAttributive}/>
                    {renderConceptDraftControl({
                        placeholder: 'choose',
                        value: item.base,
                        options: incConcat(roles, entities),
                        display: (item) => item.name
                    })}
                    {renderIsRefDraftControl({
                        value: item.isRef,
                        label: 'isRef'
                    })}
                    {renderIsCollectionDraftControl({
                        value: item.isCollection,
                        label: 'isCollection'
                    })}
                </div>
            )
        })}
        <Button onClick={onAddClick}>+</Button>
    </div>
}
