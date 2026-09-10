// WebWorker 入口：接收布局消息，调用 runLayout 并回传结果
import { runLayout } from './layout'
import type { WorkerInbound, WorkerOutbound } from './types'

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data
  if (!msg) return
  if (msg.type === 'ping') {
    ;(self as unknown as Worker).postMessage({ type: 'pong' } as WorkerOutbound)
    return
  }
  if (msg.type !== 'layout') return
  try {
    const r = runLayout(msg.root, msg.gapX, msg.gapY, msg.collapsed || [], msg.mainSize)
    ;(self as unknown as Worker).postMessage({
      type: 'layoutDone',
      nodes: r.nodes,
      edges: r.edges,
      width: r.width,
      height: r.height,
      minX: r.minX,
      maxX: r.maxX,
      minY: r.minY,
      maxY: r.maxY,
      elapsed: r.elapsed
    } as WorkerOutbound)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({
      type: 'error',
      message: (err as Error).message
    } as WorkerOutbound)
  }
}