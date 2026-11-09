// usePanZoom 缩放锚定的单测：验证 zoomAt 围绕鼠标指针位置缩放，纵向不漂移
import { describe, it, expect, vi } from 'vitest'
import { ref, effectScope } from 'vue'
import { usePanZoom } from '../../src/composables/usePanZoom'
import type { ViewBox } from '../../src/core/types'

// 在非组件实例环境调用 composable：把 onBeforeUnmount 视为 no-op，避免 Vue 警告
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return { ...actual, onBeforeUnmount: () => {} }
})

/**
 * 构造一个 mock 的 SVG 元素：仅实现 zoomAt/onWheel 依赖的 getBoundingClientRect。
 * 默认 1000x500（aspect=0.5，最易暴露纵向用宽度的旧 bug）。
 */
function mkEl(width = 1000, height = 500) {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height })
  } as unknown as SVGSVGElement
}

/** 缩放前鼠标处的世界点，缩放后应仍落在屏幕比例 (mx,my) 处（误差 < 1e-6） */
function anchorDelta(out: ViewBox, before: ViewBox, mx: number, my: number): { dx: number; dy: number } {
  const beforeWX = before.x + mx * before.w
  const beforeWY = before.y + my * before.h
  const afterWX = out.x + mx * out.w
  const afterWY = out.y + my * out.h
  return { dx: afterWX - beforeWX, dy: afterWY - beforeWY }
}

describe('usePanZoom.zoomAt 鼠标锚定', () => {
  it('横向宽扁容器（aspect=0.5）中心缩放，鼠标指向的世界点保持不动', () => {
    const scope = effectScope()
    let out: ViewBox = { x: 0, y: 0, w: 500, h: 500 }
    const layoutW = ref(500)
    const v = scope.run(() =>
      usePanZoom((n) => { out = n }, { enabled: true, layoutW })
    )!
    v.setViewGetter(() => ({ x: 0, y: 0, w: 500, h: 500 }))

    v.zoomAt(mkEl(1000, 500), 1.25, 500, 250) // 鼠标在画布正中心

    expect(out.w).toBeCloseTo(625)            // 500 * 1.25
    expect(out.h).toBeCloseTo(312.5)          // 625 * 0.5（aspect）
    // 中心点 (mx=0.5,my=0.5) 缩放后必须仍在中心
    const { dx, dy } = anchorDelta(out, { x: 0, y: 0, w: 500, h: 500 }, 0.5, 0.5)
    expect(dx).toBeCloseTo(0, 6)
    expect(dy).toBeCloseTo(0, 6)

    scope.stop()
  })

  it('鼠标位于非对称位置（右下角）时，该世界点保持不动', () => {
    const scope = effectScope()
    let out: ViewBox = { x: 0, y: 0, w: 500, h: 500 }
    const layoutW = ref(500)
    const v = scope.run(() =>
      usePanZoom((n) => { out = n }, { enabled: true, layoutW })
    )!
    v.setViewGetter(() => ({ x: 0, y: 0, w: 500, h: 500 }))

    // 鼠标在 750,375 → mx=0.75, my=0.75
    v.zoomAt(mkEl(1000, 500), 0.8, 750, 375)

    const { dx, dy } = anchorDelta(out, { x: 0, y: 0, w: 500, h: 500 }, 0.75, 0.75)
    expect(dx).toBeCloseTo(0, 6)
    expect(dy).toBeCloseTo(0, 6)

    scope.stop()
  })

  it('纵向偏扁容器（aspect>1）在顶部区域缩放，锚点不漂移', () => {
    const scope = effectScope()
    let out: ViewBox = { x: 0, y: 0, w: 300, h: 600 }
    const layoutW = ref(500)
    const v = scope.run(() =>
      usePanZoom((n) => { out = n }, { enabled: true, layoutW })
    )!
    v.setViewGetter(() => ({ x: 0, y: 0, w: 500, h: 500 }))

    // 容器 500x1000（aspect=2），鼠标在 300,250 → mx=0.6, my=0.25
    v.zoomAt(mkEl(500, 1000), 1.25, 300, 250)

    const { dx, dy } = anchorDelta(out, { x: 0, y: 0, w: 500, h: 500 }, 0.6, 0.25)
    expect(dx).toBeCloseTo(0, 6)
    expect(dy).toBeCloseTo(0, 6)

    scope.stop()
  })
})