import {assert, each, isPlainObject} from './util'
import {Component} from "../global";

// type WritablePropertyName = Exclude<keyof HTMLElement, keyof Readonly<HTMLElement> >
/** Attempt to set a DOM property to the given value.
 *  IE & FF throw for certain property-value combinations.
 */
function setProperty(node: HTMLElement, name: string, value: any) {
  try {
    // name value 的类型不会写
    // @ts-ignore
    node[name] = value
  } catch (e) {
    /* eslint-disable no-console */
    console.error(e)
    /* eslint-enable no-console */
  }
}

interface ExtendedElement extends HTMLElement {
  _listeners?: {
    [k: string]: (e: Event) => any
  },
}

function eventProxy(this: ExtendedElement, e: Event) {
  const listener = this._listeners![e.type]
  return Array.isArray(listener) ? listener.forEach(l => l?.(e)) : listener?.(e)
}

export type UnhandledPlaceholder = Comment

const selectValueTmp = new WeakMap<ExtendedElement, any>()

function isValidAttribute(name:string, value:any) {
  if (typeof value !== 'object' && typeof value !== 'function') return true
  // 事件
  if ((name[0] === 'o' && name[1] === 'n') && typeof value === 'function' ) return true
  if (isPlainObject(value) && name ==='style') return true
  // 默认支持 className 的对象形式
  if (isPlainObject(value) && name ==='className') return true

  return false
}

function isEventName(name: string) {
  return name[0] === 'o' && name[1] === 'n'
}

export function setAttribute(node: ExtendedElement, name: string, value: any,  isSvg?: boolean) {
  if (Array.isArray(value) && name !== 'style' && name !== 'className' && !isEventName(name) ) {
    // 全都是覆盖模式，只处理最后一个
    return setAttribute(node, name, value.at(-1), isSvg)
  }


  // uuid
  if (name === 'uuid') {
    node.setAttribute('data-uuid', value)
    return
  }

  // 事件
  if (name[0] === 'o' && name[1] === 'n') {
    const useCapture = name !== (name = name.replace(/Capture$/, ''))
    let eventName = name.toLowerCase().substring(2)
    // CAUTION 体验改成和 react 的一致
    if (eventName === 'change') eventName = 'input'
    if (value) {
      node.addEventListener(eventName, eventProxy, useCapture)
    } else {
      node.removeEventListener(eventName, eventProxy, useCapture)
    }

    assert(node._listeners?.[eventName] === undefined, `${eventName} already listened`);
    (node._listeners || (node._listeners = {}))[eventName] = value

    return
  }

  // style
  if (name === 'style') {
    if (!value || (Array.isArray(value) && !value.length)) {
      node.style.cssText = value || ''
    }
    const styles = Array.isArray(value) ? value : [value]
    styles.forEach(style => {
      if (typeof style !== 'object') assert(false, 'style can only be object, string style is deprecated')
      each(style, (v, k) => {
        if (v === undefined) {
          // @ts-ignore
          node.style[k] = ''
        } else {
          // @ts-ignore
          node.style[k] = typeof v === 'number' ? (`${v}px`) : v
        }
      })
    })
    return
  }

  if (name === 'className') {
    const classNames = Array.isArray(value) ? value : [value]
    let classNameValue = ''
    classNames.forEach((className) => {
      if (typeof className === 'object') {
        Object.entries(className).forEach(([name, shouldShow]) => {
          if (shouldShow) classNameValue = `${classNameValue} ${name}`
        })
      } else if(typeof className === 'string'){
        // 只能是 string
        classNameValue = `${classNameValue} ${className}`
      } else {
        assert(false, 'className can only be string or {[k:string]:boolean}')
      }
    })

    node.setAttribute('class', classNameValue)
    return
  }

  // 剩下的都是 primitive value 的情况了
  if (name === 'key' || name === 'ref') {
    // ignore
  } else if (name === 'class' && !isSvg) {
    node.className = value || ''
  } else if(name === 'value') {
    (node as HTMLDataElement).value = value

    // CAUTION 因为 select 如果 option 还没有渲染（比如 computed 的情况），那么设置 value 就没用，我们这里先存着，
    //  等 append option children 的时候再 set value 一下
    if (node.tagName === 'SELECT') {
      selectValueTmp.set(node, value)
    } else if (node.tagName === 'OPTION') {
      // 当 option 的 value 发生变化的时候也要 reset 一下，因为可能这个时候与 select value 相等的 option 才出现
      resetOptionParentSelectValue(node)
    } else  if (node.tagName === 'INPUT' && (node as HTMLObjectElement).type === 'checkbox') {
      // checkbox 也支持用 value ，这样容易统一 api
      if (value) {
        node.setAttribute('checked', 'true')
      } else {
        node.removeAttribute('checked')
      }
    } else if (node.tagName === 'INPUT' && (node as HTMLObjectElement).type === 'text' && value === undefined) {
      // 特殊处理一下 input value 为 undefined 的情况
      (node as HTMLDataElement).value = ''
    }
  } else if (name === 'checked' && node.tagName === 'INPUT' && (node as HTMLObjectElement).type === 'checkbox') {
    // checkbox 的 checked 支持用 boolean 表示
    if (value) {
      node.setAttribute('checked', 'true')
    } else {
      node.removeAttribute('checked')
    }

  }else if (name === 'disabled') {
    if (value) {
      node.setAttribute('disabled', 'true')
    } else {
      node.removeAttribute('disabled')
    }

  }else if (name === 'dangerouslySetInnerHTML') {
    console.warn(value)
    if (value) node.innerHTML = value.__html || ''
  } else if (name !== 'list' && name !== 'type' && !isSvg && name in node) {
    setProperty(node, name, value == null ? '' : value)
    if (value == null || value === false) node.removeAttribute(name)
  } else {
    const ns = isSvg && (name !== (name = name.replace(/^xlink\:?/, '')))
    if (value == null || value === false) {
      if (ns) {
        node.removeAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase())
      } else if (name.toLowerCase() === 'contenteditable' && value === false){
        node.setAttribute(name, 'false')
      } else {
        node.removeAttribute(name)
      }
    } else if (typeof value !== 'function' && ns) {
      node.setAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase(), value)

    } else {
      node.setAttribute(name, value)
    }
  }
}

export type AttributesArg = {
  [k: string] : any
}



export type JSXElementType =  string | typeof Fragment | Component


type UnhandledChildInfo = {placeholder: UnhandledPlaceholder, child: any}
export const containerToUnhandled = new WeakMap<any, UnhandledChildInfo[]>()

type UnhandledAttrInfo = {el: ExtendedElement, key: string, value: any}
export const containerToUnhandledAttr = new WeakMap<any, UnhandledAttrInfo[]>()

type VNode = {
  type: JSXElementType,
  props? : AttributesArg,
  children?: any
}


export function createElement(type: JSXElementType, rawProps : AttributesArg, ...children: any[]) : VNode|HTMLElement|Comment|DocumentFragment|SVGElement|string|number|undefined|null{
  const { _isSVG, ...props } = rawProps || {}

  let container: HTMLElement|DocumentFragment|SVGElement

  if (type === Fragment) {
    container = document.createDocumentFragment()
  } else if (typeof type === 'string') {
    container = _isSVG ? document.createElementNS('http://www.w3.org/2000/svg', type) : document.createElement(type)
  } else {
    return { type, props, children }
  }


  const unhandledAttr: UnhandledAttrInfo[] = []
  const unhandledChildren: UnhandledChildInfo[] = []

  children?.forEach((child) => {
    if (child === undefined || child === null) return

    if (typeof child === 'string' || typeof child === 'number') {
      container.appendChild(document.createTextNode(child.toString()))
    } else if (child instanceof HTMLElement || child instanceof DocumentFragment || child instanceof SVGElement) {
      container.appendChild(child)
      // 往上传递 unhandledChild ，直到没有 parent 了为止
      const unhandledChildInChild = containerToUnhandled.get(child)
      if (unhandledChildInChild) {
        containerToUnhandled.delete(child)
        unhandledChildren.push(...unhandledChildInChild)
      }

      // 往上传递 unhandledAttr 和 attr，直到没有 parent 了为止
      const unhandledChildInAttr = containerToUnhandledAttr.get(child)

      if (unhandledChildInAttr) {
        containerToUnhandledAttr.delete(child)
        unhandledAttr.push(...unhandledChildInAttr)
      }

    } else {
      const placeholder: UnhandledPlaceholder = new Comment('unhandledChild')
      container.appendChild(placeholder)
      unhandledChildren.push({ placeholder, child})
    }
  })

  // CAUTION 注意这里一定要先处理往 children 再处理自身的 prop，因为像 Select 这样的元素只有在渲染完 option 之后再设置 value 才有效。
  //  否则会出现  Select value 自动变成 option 第一个的情况。
  if (props) {
    Object.entries(props).forEach(([key, value]) => {
      // 注意这里好像写得很绕，但逻辑判断是最少的
      if ( Array.isArray(value)) {
        if (!value.every(v => isValidAttribute(key, v))){
          unhandledAttr.push({ el: container as ExtendedElement, key, value})
          return
        }
      } else if(!isValidAttribute(key, value)){
        unhandledAttr.push({ el: container as ExtendedElement, key, value})
        return
      }
      setAttribute(container as ExtendedElement, key, value, _isSVG)
    })
  }

  // 把 unhandled child/attr 全部收集到顶层的  container 上，等外部处理，这样就不用外部去遍历 jsx 的结果了
  if (unhandledChildren.length) containerToUnhandled.set(container, unhandledChildren)
  if (unhandledAttr) containerToUnhandledAttr.set(container, unhandledAttr)

  // CAUTION ref 外部处理
  return container
}


export function Fragment() {}


function resetOptionParentSelectValue(targetOption: HTMLElement) {
  const target = targetOption.parentElement
  if (selectValueTmp.has(target as ExtendedElement)) {
    (target as HTMLDataElement).value = selectValueTmp.get(target as ExtendedElement)
  }
}

export function insertBefore(newEl: Comment|HTMLElement|DocumentFragment|SVGElement|Text, refEl: HTMLElement|Comment|Text|SVGElement) {
  // CAUTION 这里用 parentNode.insertBefore ，因为 parent 可能是 DocumentFragment，只能用 parentNode 读
  const result = refEl.parentNode!.insertBefore!(newEl, refEl)
  if ((newEl as Element).tagName === 'OPTION') {
    resetOptionParentSelectValue(newEl as HTMLElement)
  }

  return result
}

// TODO reactive 化
export function createElementNS(type: string, props: AttributesArg, ...children: any[]) {
  return createElement(type, {_isSVG: true, ...(props || {})}, children)
}


export function dispatchEvent(target: ExtendedElement, event: Event) {
  return eventProxy.call(target, event)
}