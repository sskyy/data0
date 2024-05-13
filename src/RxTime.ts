import {Atom, isAtom, atom} from "./atom.js";
import {autorun} from "./autorun.js";
import {assert} from "./util.js";

type Operation = {
    type: | 'add' | 'sub' | 'mul' | 'div'
    value: number | Atom<number> | Operation[] | RxTime
}

export class RxTime {
    public operations: Operation[] = []
    public interval?: number
    public timeoutId: any = null
    add(value: number|RxTime|Atom<number>): RxTime {
        assert(!this.data, 'RxTime can not be modified after resolved')
        this.operations.push({type: 'add', value})
        return this
    }
    sub(value: number|Atom<number>|RxTime): RxTime {
        assert(!this.data, 'RxTime can not be modified after resolved')
        this.operations.push({type: 'sub', value})
        return this
    }
    mul(value: number|Atom<number>): RxTime {
        assert(!this.data, 'RxTime can not be modified after resolved')
        this.operations.push({type: 'mul', value})
        return this
    }
    div(value: number|Atom<number>): RxTime {
        assert(!this.data, 'RxTime can not be modified after resolved')
        this.operations.push({type: 'div', value})
        return this
    }
    // 整理
    simplifying() {
        let coefficient = 1
        let constant = 0
        for(let operation of this.operations) {
            switch(operation.type) {
                case 'add':
                    if (typeof operation.value === 'number') {
                        constant += operation.value
                    } else if(isAtom(operation.value)) {
                        constant += operation.value()
                    } else {
                        const other = operation.value as RxTime
                        const [targetCoefficient, targetConstant] = other.simplifying()
                        coefficient += targetCoefficient
                        constant += targetConstant
                    }
                    break
                case 'sub':
                    if (typeof operation.value === 'number') {
                        constant -= operation.value
                    } else if(isAtom(operation.value)) {
                        constant -= operation.value()
                    } else {
                        const other = operation.value as RxTime
                        const [targetCoefficient, targetConstant] = other.simplifying()
                        coefficient -= targetCoefficient
                        constant -= targetConstant
                    }
                    break
                case 'mul':
                    if (typeof operation.value === 'number') {
                        coefficient *= operation.value
                        constant *= operation.value
                    } else if(isAtom(operation.value)) {
                        coefficient *= operation.value()
                        constant *= operation.value()
                    }
                    break
                case 'div':
                    if (typeof operation.value === 'number') {
                        coefficient /= operation.value
                        constant /= operation.value
                    } else if(isAtom(operation.value)) {
                        coefficient /= operation.value()
                        constant /= operation.value()
                    }
                    break
            }
        }
        return [coefficient, constant]
    }
    public data?: Atom<any>
    public stopAutorun? : () => void
    resolve(compare: (v:number) => boolean): Atom<boolean> {
        const result = atom(false)
         this.stopAutorun = autorun(() => {
             // 立刻计算结果
             const currentTimestamp = Date.now()
             const [coefficient, constant] = this.simplifying()
             result(compare(currentTimestamp*coefficient + constant))

             // 如果还有 timeout，说明没到计算时间，计算中的参数变化了引发的重新计算，先清空
             if (this.timeoutId) {
                 clearTimeout(this.timeoutId)
                 this.timeoutId = null
             }
             // 下次变化的时候重新计算
             const nextChangeTimestamp = - constant / coefficient
             if (nextChangeTimestamp > currentTimestamp)  {
                 this.timeoutId = setTimeout(() => {
                     // CAUTION 这里是可以复用计算结果的，因为如果计算中有 atom 变化了，那么 autorun 整个都会重算，不会走到这里。
                     //  走到这里说明没有 atom 变化。
                     result(compare(Date.now()*coefficient + constant))
                 }, nextChangeTimestamp - currentTimestamp)
             }
        })

        this.data = result

        return result
    }
    gt(value: number|Atom<number>|RxTime): Atom<boolean> {
        this.sub(value)
        return this.resolve((v) => v > 0)
    }
    lt(value: number|Atom<number>|RxTime): Atom<boolean> {
        this.sub(value)
        return this.resolve((v) => v < 0)

    }
    eq(value: number|Atom<number>|RxTime): Atom<boolean> {
        this.sub(value)
        return this.resolve((v) => v === 0)
    }
    subscribe(interval: number) {
        this.interval = interval
        const data = atom(Date.now())
        this.interval = interval
        const intervalId = setInterval(() => {
            data(Date.now())
        }, interval)
        this.stopAutorun = () => {
            clearInterval(intervalId)
            this.timeoutId = null
        }

        return data
    }
    destroy(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
        }
        this.stopAutorun?.()
    }
}
