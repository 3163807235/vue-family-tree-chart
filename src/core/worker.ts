// WebWorker 入口：接收布局消息，调用 runLayout 并回传结果
import { runLayout } from './layout'
import type { WorkerInbound, WorkerOutbound, LayoutInput } from './types'

let cachedRoot: unknown = null

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data
  if (!msg) return
  if (msg.type === 'ping') {
    ;(self as unknown as Worker).postMessage({ type: 'pong' } as WorkerOutbound)
    return
  }
  if (msg.type !== 'layout') return
  try {
    const input = msg as LayoutInput
    if (input.root !== undefined) cachedRoot = input.root
    if (!cachedRoot) {
      ;(self as unknown as Worker).postMessage({
        type: 'error',
        message: 'no root'
      } as WorkerOutbound)
      return
    }
    const r = runLayout(
      cachedRoot as never,
      input.gapX,
      input.gapY,
      input.collapsed || [],
      input.mainSize
    )
    ;(self as unknown as Worker).postMessage({
      type: 'layoutDone',
      nodes: r.nodes,
      edges: r.edges,
      width: r.width,
      height: r.height,
      elapsed: r.elapsed
    } as WorkerOutbound)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({
      type: 'error',
      message: (err as Error).message
    } as WorkerOutbound)
  }
}