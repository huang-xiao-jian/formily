import { isFn, isCollectionType, isNormalType } from './checkers'
import {
  RawProxy,
  ProxyRaw,
  MakeObModelSymbol,
  RawShallowProxy,
} from './environment'
import { baseHandlers, collectionHandlers } from './handlers'
import { buildDataTree, getDataNode } from './tree'
import { isSupportObservable } from './externals'
import { PropertyKey, IVisitor, BoundaryFunction } from './types'

const createNormalProxy = (target: any, shallow?: boolean) => {
  const proxy = new Proxy(target, baseHandlers)
  ProxyRaw.set(proxy, target)
  if (shallow) {
    RawShallowProxy.set(target, proxy)
  } else {
    RawProxy.set(target, proxy)
  }
  return proxy
}

const createCollectionProxy = (target: any, shallow?: boolean) => {
  const proxy = new Proxy(target, collectionHandlers)
  ProxyRaw.set(proxy, target)
  if (shallow) {
    RawShallowProxy.set(target, proxy)
  } else {
    RawProxy.set(target, proxy)
  }
  return proxy
}

const createShallowProxy = (target: any) => {
  if (isNormalType(target)) return createNormalProxy(target, true)
  if (isCollectionType(target)) return createCollectionProxy(target, true)
  // never reach
  return target
}

export const createObservable = (
  target: any,
  key?: PropertyKey,
  value?: any,
  shallow?: boolean
) => {
  /* ==================================================== */
  /* =========== primitives variables ========== */
  /* ==================================================== */
  if (typeof value !== 'object') return value

  /* ==================================================== */
  /* =========== reactive proxy ========== */
  /* ==================================================== */
  // 入参值 value 为已实例化响应式对象时，直接返回即可
  const raw = ProxyRaw.get(value)
  // 临界场景，响应式对象观点原始对象修正父节点
  if (!!raw) {
    const node = getDataNode(raw)
    if (!node.target) node.target = target
    node.key = key
    return value
  }

  /* ==================================================== */
  /* =========== 普通对象 ========== */
  /* ==================================================== */
  // 不支持转换的原始类型，跳过转换
  if (!isSupportObservable(value)) return value

  /* ==================================================== */
  /* =========== host shallow proxy ========== */
  /* ==================================================== */
  // 宿主节点 shallow proxy 场景，入参值 value 不进行转换
  if (target) {
    // 获取宿主关联的原始对象
    const parentRaw = ProxyRaw.get(target) || target
    // 父节点为 ShallowProxy 时，属性无需转换响应式对象
    const isShallowParent = RawShallowProxy.get(parentRaw)

    if (isShallowParent) {
      return value
    }
  }

  /* ==================================================== */
  /* =========== deep observable ========== */
  /* ==================================================== */
  buildDataTree(target, key, value)
  // 明确创建 ShallowProxy 类型实例
  if (shallow) return createShallowProxy(value)
  if (isNormalType(value)) return createNormalProxy(value)
  if (isCollectionType(value)) return createCollectionProxy(value)
  // never reach
  return value
}

export const createAnnotation = <T extends (visitor: IVisitor) => any>(
  maker: T
) => {
  const annotation = (target: any): ReturnType<T> => {
    return maker({ value: target })
  }
  if (isFn(maker)) {
    annotation[MakeObModelSymbol] = maker
  }
  return annotation
}

export const getObservableMaker = (target: any) => {
  if (target[MakeObModelSymbol]) {
    if (!target[MakeObModelSymbol][MakeObModelSymbol]) {
      return target[MakeObModelSymbol]
    }
    return getObservableMaker(target[MakeObModelSymbol])
  }
}

export const createBoundaryFunction = (
  start: (...args: any) => void,
  end: (...args: any) => void
) => {
  function boundary<F extends (...args: any) => any>(fn?: F): ReturnType<F> {
    let results: ReturnType<F>
    try {
      start()
      if (isFn(fn)) {
        results = fn()
      }
    } finally {
      end()
    }
    return results
  }

  boundary.bound = createBindFunction(boundary)
  return boundary
}

export const createBindFunction = <Boundary extends BoundaryFunction>(
  boundary: Boundary
) => {
  function bind<F extends (...args: any[]) => any>(
    callback?: F,
    context?: any
  ): F {
    return ((...args: any[]) =>
      boundary(() => callback.apply(context, args))) as any
  }
  return bind
}

export const createBoundaryAnnotation = (
  start: (...args: any) => void,
  end: (...args: any) => void
) => {
  const boundary = createBoundaryFunction(start, end)
  const annotation = createAnnotation(({ target, key }) => {
    target[key] = boundary.bound(target[key], target)
    return target
  })
  boundary[MakeObModelSymbol] = annotation
  boundary.bound[MakeObModelSymbol] = annotation
  return boundary
}
