// 家谱数据结构校验（组件 props 变更前调用，失败时 emit error）
import type { FamilyNode } from './types'

export function validateFamily(node: unknown, seen: Set<string> = new Set()): void {
  if (!node || typeof node !== 'object') {
    throw new TypeError('data 必须为对象')
  }
  const n = node as FamilyNode
  if (!n.id || typeof n.id !== 'string') {
    throw new TypeError('每个节点必须有字符串类型的 id')
  }
  if (seen.has(n.id)) {
    throw new Error(`检测到 id 重复: ${n.id}`)
  }
  seen.add(n.id)
  if (n.gender && n.gender !== 'm' && n.gender !== 'f') {
    throw new TypeError(`gender 必须为 'm' | 'f'，节点 ${n.id} 非法`)
  }
  if (n.spouse && !Array.isArray(n.spouse)) {
    throw new TypeError(`spouse 必须为数组，节点 ${n.id} 非法`)
  }
  if (n.children) {
    if (!Array.isArray(n.children)) {
      throw new TypeError(`children 必须为数组，节点 ${n.id} 非法`)
    }
    for (const c of n.children) validateFamily(c, seen)
  }
}

export function countNodes(node: FamilyNode | null | undefined): number {
  if (!node) return 0
  let n = 1
  if (node.children) {
    for (const c of node.children) n += countNodes(c)
  }
  return n
}