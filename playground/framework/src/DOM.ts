import { each } from './util'

let uuid = 0
function getId() {
  return ++uuid
}



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
  return Array.isArray(listener) ? listener.forEach(l => l(e)) : listener(e)
}

export type UnhandledPlaceholder = Comment


export function setAttribute(node: ExtendedElement, name: string, value: any, collectUnhandledAttr?: (info: UnhandledAttrInfo) => any, isSvg?: boolean) {
  // 只有 style 允许 object，否则就是不认识的属性
  if (typeof value === 'object' && name !=='style') {
    collectUnhandledAttr!({el: node, key: name, value});
    return
  }

  // 处理函数
  if (typeof value === 'function' ) {
    // 只有事件回调允许是函数，否则的话认为是智能节点，外部需要控制
    if ( !(name[0] === 'o' && name[1] === 'n')){
      value(node, name, setAttribute)
    } else {
      // 事件
      const useCapture = name !== (name = name.replace(/Capture$/, ''))
      name = name.toLowerCase().substring(2)
      if (value) {
        node.addEventListener(name, eventProxy, useCapture)
      } else {
        node.removeEventListener(name, eventProxy, useCapture)
      }

      (node._listeners || (node._listeners = {}))[name] = value
    }

    return
  }

  // 剩下的都是能识别的情况了
  if (name === 'className') name = 'class'

  if (name === 'key' || name === 'ref') {
    // ignore
  } else if (name === 'class' && !isSvg) {
    node.className = value || ''
  } else if (name === 'style') {
    if (!value || typeof value === 'string') {
      node.style.cssText = value || ''
    }

    if (value && typeof value === 'object') {
      each(value, (v, k) => {
        if (value[k] === undefined) {
          // FIXME
          // @ts-ignore
          node.style[k] = ''
        } else {
          // FIXME
          // @ts-ignore
          node.style[k] = typeof v === 'number' ? (`${v}px`) : v
        }
      })
    }
  } else if (name === 'dangerouslySetInnerHTML') {
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
      console.warn(`unknown attr: ${name}: ${value}`)
    }
  }
}

export type AttributesArg = {
  [k: string] : any
}

export function setAttributes(attributes: AttributesArg, element: HTMLElement, collectUnhandledAttr: (info: UnhandledAttrInfo) => void) {
  each(attributes, (attribute, name) => {
    if (name === '_uuid') {
      setAttribute(element as ExtendedElement, 'data-uuid', getId())
    } else {
      setAttribute(element as ExtendedElement, name, attribute, collectUnhandledAttr)
    }
  })
}




type Component = (props: any) => HTMLElement

export type JSXElementType =  string | typeof Fragment | Component


type UnhandledChildInfo = {placeholder: UnhandledPlaceholder, child: any}
export const containerToUnhandled = new WeakMap<any, UnhandledChildInfo[]>()

type UnhandledAttrInfo = {el: ExtendedElement, key: string, value: any}
export const containerToUnhandledAttr = new WeakMap<any, UnhandledAttrInfo[]>()

export function createElement(type: JSXElementType, props: AttributesArg, ...children: any[]) : ChildNode|any{

  let container: ChildNode|DocumentFragment
  if (type === Fragment) {
    container = document.createDocumentFragment()
  } else if (typeof type === 'string') {
    container = document.createElement(type)
  } else {

    return { type, props: { ...props, children }}
  }

  const unhandledAttr: UnhandledAttrInfo[] = []


  if (props) {
    const collectUnhandledAttr = (info: UnhandledAttrInfo) => {
      unhandledAttr.push(info)
    }
    setAttributes(props, container as HTMLElement, collectUnhandledAttr)
  }

  const unhandledChildren: UnhandledChildInfo[] = []

  children && children.forEach((child) => {
    if (child === undefined || child === null) return

    if (typeof child === 'string' || typeof child === 'number') {
      container.appendChild(document.createTextNode(child.toString()))
    } else if (child instanceof HTMLElement) {
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

  // 把 unhandled child/attr 全部收集到顶层的  container 上，等外部处理，这样就不用外部去遍历 jsx 的结果了
  if (unhandledChildren.length) containerToUnhandled.set(container, unhandledChildren)
  if (unhandledAttr) containerToUnhandledAttr.set(container, unhandledAttr)

  // TODO props.ref 也改成收集的形式，外部决定合适执行

  return container
}


export function Fragment() {}

export default {
  createElement,
  Fragment,
}
