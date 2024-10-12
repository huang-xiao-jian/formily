import { isFn } from './checkers'
import { buildDataTree } from './tree'
import { observable } from './observable'
import { getObservableMaker } from './internals'
import { isObservable, isAnnotation, isSupportObservable } from './externals'
import { Annotations } from './types'
import { action } from './action'
import { ObModelSymbol } from './environment'

export function define<Target extends object = any>(
  target: Target,
  annotations?: Annotations<Target>
): Target {
  // 忽略响应式宿主对象
  if (isObservable(target)) return target
  // 忽略不支持的原始类型
  if (!isSupportObservable(target)) return target

  // 宿主标记为响应式对象
  target[ObModelSymbol] = target

  buildDataTree(undefined, undefined, target)

  // 基于注释函数处理属性
  for (const key in annotations) {
    const annotation = annotations[key]
    if (isAnnotation(annotation)) {
      getObservableMaker(annotation)({
        target,
        key,
      })
    }
  }
  return target
}

export function model<Target extends object = any>(target: Target): Target {
  const annotations = Object.keys(target || {}).reduce((buf, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (descriptor && descriptor.get) {
      buf[key] = observable.computed
    } else if (isFn(target[key])) {
      buf[key] = action
    } else {
      buf[key] = observable
    }
    return buf
  }, {})
  return define(target, annotations)
}
