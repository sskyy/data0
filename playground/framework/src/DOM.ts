import { each, isPlainObject } from './util'

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

const selectValueTmp = new WeakMap<ExtendedElement, any>()


export function setAttribute(node: ExtendedElement, name: string, value: any, collectUnhandledAttr?: (info: UnhandledAttrInfo) => any, isSvg?: boolean) {
  // 只有 style 允许 object，否则就是不认识的属性
  if (isPlainObject(value) && name !=='style') {
    collectUnhandledAttr!({el: node, key: name, value});
    return
  }

  // 处理函数
  if (typeof value === 'function' ) {
    // 只有事件回调允许是函数，否则的话可能是 computed attr/atom，让外部处理
    if (!(name[0] === 'o' && name[1] === 'n')) {
      collectUnhandledAttr!({el: node, key: name, value});
      return
    }

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

  // 剩下的都是能识别的情况了
  if (name === 'className') name = 'class'

  if (name === 'key' || name === 'ref') {
    // ignore
  } else if (name === 'class' && !isSvg) {
    node.className = value || ''
  } else if(name === 'value') {
    (node as object).value = value


    // CAUTION 因为 select 如果 option 还没有渲染（比如 computed 的情况），那么设置 value 就没用，我们这里先存着，
    //  等 append option children 的时候再 set value 一下
    if (node.tagName === 'SELECT') {
      selectValueTmp.set(node, value)
    } else if (node.tagName === 'OPTION') {
      // 当 option 的 value 发生变化的时候也要 reset 一下，因为可能这个时候与 select value 相等的 option 才出现
      resetOptionParentSelectValue(node)
    } else  if (node.tagName === 'INPUT' && (node as object).type === 'checkbox') {
      // checkbox 也支持用 value ，这样容易统一 api
      if (value) {
        node.setAttribute('checked', 'true')
      } else {
        node.removeAttribute('checked')
      }
    } else if (node.tagName === 'INPUT' && (node as object).type === 'text' && value === undefined) {
      // 特殊处理一下 input value 为 undefined 的情况
      (node as object).value = ''
    }
  } else if (name === 'checked' && node.tagName === 'INPUT' && (node as object).type === 'checkbox') {
    // checkbox 的 checked 支持用 boolean 表示
    if (value) {
      node.setAttribute('checked', 'true')
    } else {
      node.removeAttribute('checked')
    }

  }else if (name === 'style') {
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
      node.setAttribute(name, value)
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


  // CAUTION 注意这里一定要先处理往 children 再处理自身的 prop，因为像 Select 这样的元素只有在渲染完 option 之后再设置 value 才有效。
  //  否则会出现  Select value 自动变成 option 第一个的情况。
  if (props) {
    const collectUnhandledAttr = (info: UnhandledAttrInfo) => {
      unhandledAttr.push(info)
    }
    setAttributes(props, container as HTMLElement, collectUnhandledAttr)
  }

  // 把 unhandled child/attr 全部收集到顶层的  container 上，等外部处理，这样就不用外部去遍历 jsx 的结果了
  if (unhandledChildren.length) containerToUnhandled.set(container, unhandledChildren)
  if (unhandledAttr) containerToUnhandledAttr.set(container, unhandledAttr)

  // TODO props.ref 也改成收集的形式，外部决定合适执行
  return container
}


export function Fragment() {}


function resetOptionParentSelectValue(targetOption: HTMLElement) {
  const target = targetOption.parentElement
  if (selectValueTmp.has(target)) {
    (target as object).value = selectValueTmp.get(target)
  }
}

export function insertBefore(newEl: ChildNode|DocumentFragment, refEl: ChildNode|HTMLElement) {
  const result = refEl.parentElement!.insertBefore!(newEl, refEl)

  if ((newEl as HTMLElement).tagName === 'OPTION') {
    resetOptionParentSelectValue(newEl as HTMLElement)
  }

  return result
}

