// 平移 + 缩放交互：拖拽平移、滚轮以鼠标位置为中心缩放
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { ViewBox } from '../core/types'

/** 缩放倍率（<1 缩小 / >1 放大） */
export const ZOOM_OUT = 0.8
export const ZOOM_IN = 1.25
/** view.w 缩放下限 */
const MIN_W = 60
/** 缩放上限倍数（相对布局宽） */
const MAX_W_ZOOM = 8

export interface PanZoomOptions {
  /** 是否启用平移 / 缩放（可传布尔或响应式 ref） */
  enabled?: boolean | Ref<boolean>
  /** 布局总宽（用于缩放上限与适配） */
  layoutW: Ref<number>
}

interface DragState {
  sx: number
  sy: number
  vx: number
  vy: number
  moved: boolean
}

/**
 * 平移与缩放交互 hooks。
 * 通过 onPointerDown / onPointerMove / onPointerUp 绑定到 SVG 元素，
 * 通过 onWheel 绑定滚轮；所有视口变更统一经 commitView 回写（更新+emit）。
 */
export function usePanZoom(commitView: (v: ViewBox) => void, opts: PanZoomOptions) {
  const enabled = ref<boolean>(
    typeof opts.enabled === 'boolean' ? opts.enabled : (opts.enabled?.value ?? true)
  )
  if (typeof opts.enabled !== 'boolean' && opts.enabled) {
    watch(opts.enabled, (v) => { enabled.value = v }, { immediate: true })
  }
  const drag = ref<DragState | null>(null)

  /**
   * 当前 viewBox（读写均由外部 currentView 提供）。
   * 保存 getter 而非一次求值的结果，保证每次 getView() 都能读到最新视口，
   * 否则 fitView/缩放后内部拿到的是 mount 时刻的死值，导致拖动瞬间视图跳变。
   */
  let currentView: () => ViewBox = () => ({ x: 0, y: 0, w: 100, h: 100 })
  function setViewGetter(g: () => ViewBox) {
    currentView = g
  }
  function getView(): ViewBox {
    return currentView()
  }

  /** 容器宽高比 */
  function aspectOf(el: SVGSVGElement): number {
    const rect = el.getBoundingClientRect()
    return rect.height / Math.max(1, rect.width)
  }

  /** 以屏幕坐标 (px,py) 为中心缩放；不传坐标则缩放到视口中心 */
  function zoomAt(el: SVGSVGElement, factor: number, px?: number, py?: number) {
    const rect = el.getBoundingClientRect()
    const mx = (px != null ? px : rect.width / 2) / rect.width
    const my = (py != null ? py : rect.height / 2) / rect.height
    const v = getView()
    const wx = v.x + mx * v.w
    const wy = v.y + my * v.h
    const nw = Math.min(Math.max(v.w * factor, MIN_W), opts.layoutW.value * MAX_W_ZOOM)
    const aspect = rect.height / Math.max(1, rect.width)
    commitView({ x: wx - mx * nw, y: wy - my * nw, w: nw, h: nw * aspect })
  }

  function onWheel(e: WheelEvent, el: SVGSVGElement) {
    if (!enabled.value) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    zoomAt(el, e.deltaY < 0 ? ZOOM_OUT : ZOOM_IN, e.clientX - rect.left, e.clientY - rect.top)
  }

  function onPointerDown(e: PointerEvent, el: SVGSVGElement) {
    if (!enabled.value) return
    drag.value = {
      sx: e.clientX,
      sy: e.clientY,
      vx: getView().x,
      vy: getView().y,
      moved: false
    }
    try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    el.classList.add('dragging')
  }

  function onPointerMove(e: PointerEvent, el: SVGSVGElement) {
    const d = drag.value
    if (!d) return
    const rect = el.getBoundingClientRect()
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true
    if (d.moved) {
      const v = getView()
      commitView({ x: d.vx - (dx / rect.width) * v.w, y: d.vy - (dy / rect.height) * v.h, w: v.w, h: v.h })
    }
  }

  /** 拖拽结束；返回是否发生了平移（false 表示是单击，可继续分发点击/折叠） */
  function onPointerUp(e: PointerEvent, el: SVGSVGElement): { moved: boolean; target: EventTarget | null } {
    const d = drag.value
    if (!d) return { moved: false, target: null }
    const wasMoved = d.moved
    drag.value = null
    el.classList.remove('dragging')
    return { moved: wasMoved, target: e.target }
  }

  // 组件卸载时释放 drag 状态
  onBeforeUnmount(() => {
    drag.value = null
  })

  return { enabled, setViewGetter, getView, zoomAt, onWheel, onPointerDown, onPointerMove, onPointerUp }
}