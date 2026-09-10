<!-- 家谱宝塔吊线图 Vue 组件：基于 WebWorker 布局 + SVG 视口虚拟渲染 -->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, shallowRef, nextTick } from 'vue'
import { runLayout } from '../core/layout'
import { validateFamily, countNodes } from '../core/validate'
import { useVirtualRender } from '../composables/useVirtualRender'
import { usePanZoom } from '../composables/usePanZoom'
import GenRuler from './GenRuler.vue'
import DefaultNode from './DefaultNode.vue'
// 内联 Worker：将布局 Worker 打成 Blob 内联，避免库发布后 assets 路径解析失效
import FamilyWorker from '../core/worker.ts?worker&inline'
import type {
  FamilyNode,
  LayoutResult,
  ViewBox,
  TextStyle,
  PerfMetrics,
  Direction
} from '../core/types'

interface Props {
  /** 家谱根节点数据（必填）。children 顺序即长幼顺序 */
  data: FamilyNode
  /** 受控：折叠的节点 id 集合（v-model:collapsed） */
  collapsed?: string[]
  /** 受控：视口位置（v-model:view） */
  view?: ViewBox
  /** 横向单元间距（世界坐标 px），默认 100 */
  gapX?: number
  /** 纵向层间距，默认 96，范围 [70, 180] */
  gapY?: number
  /** 配偶文字相对姓名列的间距，默认 6 */
  spGap?: number
  /** 排版方向，默认 'ltr'（v-model:direction） */
  direction?: Direction
  /** 是否显示排行标签，默认 true */
  showRank?: boolean
  /** 是否显示承继标签，默认 true */
  showInherit?: boolean
  /** 主节点文字样式 */
  mainStyle?: Partial<TextStyle>
  /** 配偶辅助文字样式 */
  auxStyle?: Partial<TextStyle>
  /** 是否启用 WebWorker 布局，默认 true */
  useWorker?: boolean
  /** 文本降级阈值（可见节点超过此数则不渲染文字），默认 1200 */
  textDegradeThreshold?: number
  /** 是否显示世系标尺，默认 true */
  showRuler?: boolean
  /** 节点点击是否可折叠，默认 true */
  enableFold?: boolean
  /** 是否启用平移/缩放交互，默认 true */
  interactive?: boolean
  /** 是否启用悬停高亮分支（默认 true），线条加粗变色并突出相关分支 */
  hoverHighlight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: () => [],
  gapX: 100,
  gapY: 96,
  spGap: 6,
  direction: 'ltr',
  showRank: true,
  showInherit: true,
  useWorker: true,
  textDegradeThreshold: 1200,
  showRuler: true,
  enableFold: true,
  interactive: true,
  hoverHighlight: true
})

const emit = defineEmits<{
  'update:collapsed': [ids: string[]]
  'update:view': [view: ViewBox]
  'update:direction': [dir: Direction]
  /** 节点单击 */
  nodeClick: [node: FamilyNode]
  /** 节点双击 */
  nodeDblclick: [node: FamilyNode]
  /** 折叠前钩子，可阻止（父级监听返回 false 可阻止折叠） */
  beforeFold: [node: FamilyNode, willCollapse: boolean]
  /** 性能指标更新 */
  metrics: [m: PerfMetrics]
  /** 布局完成 */
  layoutReady: [info: { width: number; height: number; total: number }]
  /** 数据错误 */
  error: [err: Error]
}>()

// ============ 内部状态（非受控） ============
const svgEl = shallowRef<SVGSVGElement | null>(null)
const internalView = ref<ViewBox>({ x: 0, y: 0, w: 100, h: 100 })
const isDragging = ref(false)
const worker = shallowRef<Worker | null>(null)
const workerAlive = ref(false)
const layoutPending = ref(false)
const metrics = ref<PerfMetrics | null>(null)
const dataError = ref<Error | null>(null)

// 布局结果（受控派生：依赖 props.data / props.collapsed / gapX / gapY）
const layoutResult = shallowRef<LayoutResult | null>(null)

// 悬停高亮：当前悬停节点 id
const hoveredId = ref<string | null>(null)
// 悬停防抖计时器（控制 ≤200ms 内响应，避免快速扫过时频繁重建）
const hoverTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null)

/**
 * 悬停高亮集合（Set<节点id>）：
 * 由当前悬停节点向上回溯祖先链、向下搜集全部后代形成整条分支，
 * 用于给相关连线加粗变色、给分支节点打高亮 class。
 */
const highlightSet = computed<ReadonlySet<string>>(() => {
  const id = hoveredId.value
  const r = layoutResult.value
  if (!id || !r || !props.hoverHighlight) return new Set()
  const set = new Set<string>()
  set.add(id)
  // 祖先链：向上回溯
  const parentById = new Map<string, string>()
  for (const e of r.edges) parentById.set(e.childId, e.parentId)
  let cur: string | undefined = id
  while ((cur = parentById.get(cur))) set.add(cur)
  // 后代链：向下遍历（边 childId）——用一条从父到子的边集合递归收集
  const childMap = new Map<string, string[]>()
  for (const e of r.edges) {
    const arr = childMap.get(e.parentId)
    if (arr) arr.push(e.childId)
    else childMap.set(e.parentId, [e.childId])
  }
  const stack: string[] = [id]
  while (stack.length) {
    const kids = childMap.get(stack.pop() as string)
    if (kids) for (const k of kids) { if (!set.has(k)) { set.add(k); stack.push(k) } }
  }
  return set
})

/** 判断某连线是否属于高亮分支 */
function isHighlightEdge(e: { parentId: string; childId: string }): boolean {
  return props.hoverHighlight && highlightSet.value.has(e.parentId) && highlightSet.value.has(e.childId)
}

// 视口：受控优先，否则内部
const currentView = computed<ViewBox>(() => props.view ?? internalView.value)

// 用户是否已手动交互（拖拽/缩放）；交互后停止自动定位，保留用户视口
const userInteracted = ref(false)
// 折叠/展开目标节点 id：本次交互折叠某节点后，布局完成时把视口居中到该节点，
// 避免折叠导致树收缩、节点移出视野而无法确认操作结果
const pendingFocus = ref<string | null>(null)
// 数据源变化时置位：布局完成后自动定位到始祖（fit）。仅数据重新生成才置位；
// 间距/字号调整绝不置位，从而彻底避免调间距触发 focusRoot 引起意外缩放
const focusRequested = ref(false)

// ===== 交互 composable：平移缩放 + 虚拟渲染 =====
const virtual = useVirtualRender({
  layout: layoutResult,
  view: currentView,
  direction: computed(() => props.direction),
  textDegradeThreshold: computed(() => props.textDegradeThreshold)
})

const panzoom = usePanZoom((v) => syncView(v), {
  enabled: computed(() => props.interactive),
  layoutW: computed(() => layoutResult.value?.width ?? 1)
})

// 顶层解构，供模板自动解包响应式（虚拟渲染结果）
const visibleNodes = virtual.visibleNodes
const visibleEdges = virtual.visibleEdges
const textDegraded = virtual.textDegraded

// 总节点数（用于过载提示）
const totalNodes = computed(() => countNodes(props.data))
const overload = computed(() => totalNodes.value > 50000)

// 文字样式解析（Props 提供分项，缺失回退默认）
const textMain = computed(() => ({
  size: props.mainStyle?.size ?? 12,
  color: props.mainStyle?.color ?? '#4A3222',
  font: props.mainStyle?.font ?? ''
}))
const textAux = computed(() => ({
  size: props.auxStyle?.size ?? 10,
  color: props.auxStyle?.color ?? '#9A7D5C',
  font: props.auxStyle?.font ?? ''
}))

// 每世深度对应的 y（同深度节点 y 一致）
const depthY = computed<number[]>(() => {
  const r = layoutResult.value
  if (!r) return []
  const arr: number[] = []
  for (const n of r.nodes) {
    if (arr[n.depth] === undefined) arr[n.depth] = n.y
  }
  return arr
})

// ============ 数据校验（props.data 变化即触发） ============
watch(
  () => props.data,
  (d) => {
    try {
      validateFamily(d)
      dataError.value = null
    } catch (e) {
      dataError.value = e as Error
      emit('error', e as Error)
    }
  },
  { immediate: true, deep: false }
)

// ============ Worker 生命周期 ============
onMounted(() => {
  panzoom.setViewGetter(() => currentView.value)
  if (props.useWorker && typeof Worker !== 'undefined') {
    try {
      const w = new FamilyWorker()
      const probe = setTimeout(() => {
        try { w.terminate() } catch { /* ignore */ }
        worker.value = null
        workerAlive.value = false
      }, 400)
      w.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'pong') {
          workerAlive.value = true
          clearTimeout(probe)
          w.onmessage = onWorkerMessage
        }
      }
      w.postMessage({ type: 'ping' })
      worker.value = w
    } catch {
      worker.value = null
    }
  }
  // 首屏：请求自动定位到始祖（fit），使默认缩放生效
  focusRequested.value = true
  doLayout()
})

onBeforeUnmount(() => {
  if (hoverTimer.value) { clearTimeout(hoverTimer.value); hoverTimer.value = null }
  worker.value?.terminate()
  worker.value = null
})

function onWorkerMessage(e: MessageEvent) {
  layoutPending.value = false
  const data = e.data
  if (!data) return
  if (data.type === 'layoutDone') {
    const r: LayoutResult = {
      nodes: data.nodes,
      edges: data.edges,
      width: data.width,
      height: data.height,
      elapsed: data.elapsed
    }
    applyLayout(r)
  } else if (data.type === 'error') {
    // Worker 出错，降级主线程
    doLayoutFallback()
  }
}

// ============ 布局触发：依赖变化即重算（替代手动 rootDirty 脏标记） ============
// 数据源变化（重新生成）→ 重算并请求自动定位到始祖（fit）
watch(
  () => props.data,
  () => {
    if (dataError.value) return
    focusRequested.value = true
    doLayout()
  },
  { deep: false }
)
// 折叠变化 → 仅重算（折叠点击路径由 handleNodeTap 设置 pendingFocus）
watch(
  () => props.collapsed,
  () => {
    if (!dataError.value) doLayout()
  },
  { deep: false }
)
// 间距/字号变化 → 仅重算布局、保持当前视图；绝不请求自动定位，避免缩放
watch(
  [() => props.gapX, () => props.gapY, () => props.mainStyle?.size],
  () => {
    if (!dataError.value) doLayout()
  },
  { deep: false }
)

function doLayout() {
  if (dataError.value || !props.data) return
  const payload = {
    type: 'layout' as const,
    // 深拷贝为纯对象：去除 Vue reactive proxy，否则 Worker postMessage 无法结构化克隆
    root: JSON.parse(JSON.stringify(props.data)),
    gapX: props.gapX,
    gapY: props.gapY,
    // collapsed 需复制为纯数组（reactive Proxy 数组不可结构化克隆）
    collapsed: [...props.collapsed],
    // 主字号：布局据此测量节点内容高度，自适应吊线起点
    mainSize: props.mainStyle?.size
  }
  if (props.useWorker && worker.value && workerAlive.value) {
    layoutPending.value = true
    worker.value.postMessage(payload)
  } else {
    doLayoutFallback()
  }
}

function doLayoutFallback() {
  try {
    const r = runLayout(props.data, props.gapX, props.gapY, props.collapsed, props.mainStyle?.size)
    applyLayout(r)
  } catch (e) {
    dataError.value = e as Error
    emit('error', e as Error)
  }
}

function applyLayout(r: LayoutResult) {
  layoutResult.value = r
  emit('layoutReady', { width: r.width, height: r.height, total: totalNodes.value })
  emit('metrics', {
    layoutMs: r.elapsed,
    renderMs: null,
    visibleCount: virtual.visibleNodes.value.length,
    domCount: virtual.visibleNodes.value.length + virtual.visibleEdges.value.length,
    textDegraded: virtual.textDegraded.value,
    total: totalNodes.value
  })
  // 数据源变化时自动定位到始祖（fit）；间距/字号调整绝不走此分支，保持缩放不变
  if (focusRequested.value) {
    focusRequested.value = false
    if (!userInteracted.value && props.view === undefined) {
      requestAnimationFrame(() => focusRoot())
      return
    }
  }
  // 折叠/展开某节点后：布局完成时把视口居中到该节点（保留用户当前缩放），
  // 避免折叠令树收缩、节点移出视野而无法确认操作结果
  if (pendingFocus.value && props.view === undefined) {
    const id = pendingFocus.value
    pendingFocus.value = null
    requestAnimationFrame(() => focusNode(id))
  }
}

// ============ 交互：节点点击折叠（受控回写） ============
// pointerdown 时命中的节点 id（在 setPointerCapture 之前记录，
// 因为捕获后 pointerup 的 target 会被重定向到 svg，无法再用 closest 命中）
const downHitId = ref<string | null>(null)

function handleNodeTap(node: FamilyNode) {
  emit('nodeClick', node)
  if (!props.enableFold) return
  const existing = new Set(props.collapsed)
  const willCollapse = !existing.has(node.id)
  // beforeFold 监听器返回 false 时阻止折叠
  const ret = emit('beforeFold', node, willCollapse) as unknown
  if (ret === false) return
  if (willCollapse) existing.add(node.id)
  else existing.delete(node.id)
  // 记录本次交互的节点，供布局重算完成后将视口居中到它（保留用户缩放）
  pendingFocus.value = node.id
  emit('update:collapsed', Array.from(existing))
}

function onNodeDblclick(node: FamilyNode) {
  emit('nodeDblclick', node)
}

// ============ 悬停高亮（≤200ms 防抖，避免频繁扫过节点时反复重建集合） ============
function scheduleHighlight(id: string | null) {
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
    hoverTimer.value = null
  }
  if (id === null) {
    hoveredId.value = null
    return
  }
  hoverTimer.value = setTimeout(() => {
    hoveredId.value = id
  }, 60) // 60ms 远低于 200ms 阈值，兼顾响应速度与防误触
}

function onNodeEnter(nodeId: string) {
  if (!props.hoverHighlight) return
  if (nodeId !== hoveredId.value) scheduleHighlight(nodeId)
}
function onNodeLeave() {
  if (!props.hoverHighlight) return
  scheduleHighlight(null)
}

/**
 * SVG 上 pointerup 统一分发：
 * 拖拽 i (moved) → 不触发点击；否则命中节点则折叠；命中空白则只结束交互，
 * 保留用户当前缩放/平移，不重置视口。
 */
function onSvgPointerUp(e: PointerEvent, el: SVGSVGElement) {
  const { moved } = panzoom.onPointerUp(e, el)
  if (moved) { downHitId.value = null; return }
  // 用 pointerdown 时记录的真实命中节点 id；命中节点则折叠
  const id = downHitId.value
  downHitId.value = null
  if (id && layoutResult.value) {
    const node = layoutResult.value.nodes.find(n => n.id === id)
    if (node) handleNodeTap(node as unknown as FamilyNode)
  }
  // 点击空白：不做任何视口变更，保持用户当前的缩放比例
}

// ============ 视口同步（受控回写） ============
function syncView(v: ViewBox) {
  internalView.value = v
  emit('update:view', v)
}

/** RTL 坐标镜像：布局世界坐标 x → 显示坐标（rtl 时关于整树中心对称反转） */
function viewX(x: number): number {
  return props.direction === 'rtl' ? (layoutResult.value?.width ?? 1) - x : x
}

// 透传给 usePanZoom 的事件处理器（模板绑定 SVG 元素样式）
function onWheel(e: WheelEvent, el: SVGSVGElement) {
  userInteracted.value = true
  panzoom.onWheel(e, el)
}
function onPointerDown(e: PointerEvent, el: SVGSVGElement) {
  // 在捕获前记录真实 target 命中的节点（捕获后 target 会重定向到 svg）
  const g = (e.target as Element | null)?.closest?.('g.ftc-node')
  downHitId.value = g ? g.getAttribute('data-id') : null
  userInteracted.value = true
  panzoom.onPointerDown(e, el)
}
function onPointerMove(e: PointerEvent, el: SVGSVGElement) {
  panzoom.onPointerMove(e, el)
}

// ============ 暴露给父级的命令式方法 ============
function containerAspect(): number {
  const el = svgEl.value
  if (!el) return 1
  const rect = el.getBoundingClientRect()
  return rect.height / Math.max(1, rect.width)
}

function fitView() {
  if (!layoutResult.value) return
  const r = layoutResult.value
  const w = r.width
  const aspect = containerAspect()
  syncView({ x: 0, y: 0, w, h: w * aspect })
}

/**
 * 初始默认视图：等待容器可测后，以始祖节点（depth 0）为焦点，
 * 放大到整树宽度的 1/20，平移到始祖节点处于视口中心。
 */
function focusRoot() {
  const r = layoutResult.value
  if (!r) return
  const aspect = stableAspect()
  if (aspect === null) {
    // 容器尚未稳定，下帧重试，确保定位基于正确的实际尺寸
    if (focusRetryCount.value++ < 10) requestAnimationFrame(() => focusRoot())
    return
  }
  const root = r.nodes.find(n => n.depth === 0)
  // 默认缩放恒定 1:1：viewBox 可视宽 = 容器实际像素宽，文字像素尺寸不随节点数量变化。
  // （原 r.width/20 会使人少(树窄)时 viewBox 过小 → 元素被过度放大）
  const el = svgEl.value
  const w = el && el.clientWidth > 0 ? el.clientWidth : Math.max(r.width / 20, 120)
  const h = el && el.clientHeight > 0 ? el.clientHeight : w * aspect
  const cx = root ? root.x : r.width / 2
  const cy = root ? root.y : 0
  // 直接定位（不插值）：每次布局重算后自动归位到始祖中心，避免视口残留在旧位置形成"跑偏/瞬间放大"
  syncView({ x: cx - w / 2, y: cy - h / 2, w, h })
}

/** 初始定位等待容器尺寸稳定的重试次数 */
const focusRetryCount = ref(0)

/**
 * 获取容器宽高比；若容器尚未稳定（宽高为 0）返回 null，由调用方重试。
 */
function stableAspect(): number | null {
  const el = svgEl.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (!(rect.width > 0) || !(rect.height > 0)) return null
  return rect.height / rect.width
}

function focusNode(id: string) {
  const r = layoutResult.value
  if (!r) return
  const n = r.nodes.find(x => x.id === id)
  if (!n) return
  const w = internalView.value.w
  const h = internalView.value.h
  syncView({ x: n.x - w / 2, y: n.y - h / 2, w, h })
}

function expandAll() {
  emit('update:collapsed', [])
}

function collapseAll() {
  if (!layoutResult.value) return
  const ids = layoutResult.value.nodes.filter(n => n.hasChildren).map(n => n.id)
  emit('update:collapsed', ids)
}

function toggleDirection() {
  emit('update:direction', props.direction === 'ltr' ? 'rtl' : 'ltr')
}

defineExpose({ fitView, focusNode, expandAll, collapseAll, toggleDirection })
</script>

<template>
  <div class="ftc-root" :class="{ 'ftc-has-hl': hoverHighlight && hoveredId }">
    <!-- 数据校验失败 -->
    <div v-if="dataError" class="ftc-error">
      <slot name="error" :error="dataError">{{ dataError.message }}</slot>
    </div>
    <!-- 空数据 -->
    <div v-else-if="!props.data?.children?.length" class="ftc-empty">
      <slot name="empty">暂无家谱数据</slot>
    </div>
    <!-- 超过上限 -->
    <div v-else-if="overload" class="ftc-overload">
      <slot name="overload" :total="totalNodes">
        节点过多 ({{ totalNodes }})，请缩小数据范围
      </slot>
    </div>

    <!-- 正常渲染 -->
    <template v-else>
      <!-- 工具栏插槽：暴露状态与命令式方法给父级自定义 UI -->
      <div v-if="$slots.toolbar" class="ftc-toolbar">
        <slot name="toolbar"
              :direction="direction"
              :gap-x="gapX"
              :gap-y="gapY"
              :collapsed="collapsed"
              :set-direction="(d: Direction) => emit('update:direction', d)"
              :toggle-direction="toggleDirection"
              :expand-all="expandAll"
              :collapse-all="collapseAll"
              :fit-view="fitView"
              :focus-node="focusNode"
        />
      </div>

      <div class="ftc-canvas">
        <svg ref="svgEl" class="ftc-view" role="application" aria-label="家谱宝塔吊线图"
             :viewBox="`${currentView.x} ${currentView.y} ${currentView.w} ${currentView.h}`"
             @wheel.prevent="onWheel($event as unknown as WheelEvent, $event.currentTarget as unknown as SVGSVGElement)"
             @pointerdown="onPointerDown($event, $event.currentTarget as unknown as SVGSVGElement)"
             @pointermove="onPointerMove($event, $event.currentTarget as unknown as SVGSVGElement)"
             @pointerup="onSvgPointerUp($event, $event.currentTarget as unknown as SVGSVGElement)">
          <defs>
            <marker id="ftc-dotEdge" markerUnits="userSpaceOnUse" orient="auto"
                    markerWidth="12" markerHeight="12" refX="6" refY="6">
              <circle cx="6" cy="6" r="3" fill="#FFFFFF" stroke="#A97F4F" stroke-width="1.2" />
            </marker>
          </defs>
          <!-- 默认渲染：连线 + 节点（用户可用 node/edge 插槽替换） -->
          <g v-if="layoutResult">
            <!-- 连线：仅渲染当前视口可见；悬停高亮分支加粗变色 -->
            <path v-for="ed in visibleEdges" :key="ed.d"
                  :d="ed.d" class="ftc-edge"
                  :class="{ 'ftc-edge-hl': isHighlightEdge(ed) }"
                  :transform="props.direction === 'rtl' ? `translate(${layoutResult.width},0) scale(-1,1)` : undefined"
                  marker-start="url(#ftc-dotEdge)"
                  marker-end="url(#ftc-dotEdge)" />
            <!-- 节点：仅渲染当前视口可见；默认渲染委托给 DefaultNode -->
            <g v-for="n in visibleNodes" :key="n.id"
               :data-id="n.id"
               :class="['ftc-node',
                 n.depth === 0 && 'ftc-root',
                 n.collapsed && 'ftc-collapsed',
                 hoverHighlight && highlightSet.has(n.id) && 'ftc-node-hl']"
               :transform="`translate(${viewX(n.x)},${n.y})`"
               @dblclick="onNodeDblclick(n as unknown as FamilyNode)"
               @mouseenter="onNodeEnter(n.id)"
               @mouseleave="onNodeLeave">
              <DefaultNode
                :node="n"
                :direction="direction"
                :sp-gap="spGap"
                :text-main="textMain"
                :text-aux="textAux"
                :text-degraded="textDegraded"
                :show-rank="showRank"
                :show-inherit="showInherit"
                :enable-fold="enableFold"
              />
            </g>
          </g>
        </svg>

        <!-- 世系标尺（可选） -->
        <GenRuler v-if="showRuler && layoutResult" :depths="depthY" :view="currentView" />

        </div>

      <!-- 性能指标浮层 -->
      <slot v-if="metrics" name="metrics" :metrics="metrics">
        <div class="ftc-metrics">
          布局 {{ metrics.layoutMs?.toFixed(1) ?? '-' }}ms · 可见 {{ metrics.visibleCount }}
        </div>
      </slot>
    </template>
  </div>
</template>

<style scoped>
.ftc-root {
  position: relative;
  width: 100%;
  height: 100%;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  background: var(--ftc-bg, #FCF7EC);
  color: var(--ftc-text-color, #4A3222);
}
.ftc-view {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: default;
}
/* 仅拖拽过程中切换为抓取指针 */
.ftc-view.dragging { cursor: grabbing; }
.ftc-node { cursor: pointer; }
.ftc-node-rect { fill: none; }
.ftc-node-text {
  fill: var(--ftc-text-color, #4A3222);
  font-size: 12px;
  pointer-events: none;
  user-select: none;
}
.ftc-edge {
  stroke: var(--ftc-edge-color, #A97F4F);
  stroke-width: 1.5;
  fill: none;
  pointer-events: none;
}
/* 悬停高亮：相关连线加粗并使用对比色 */
.ftc-edge-hl {
  stroke: var(--ftc-edge-hl-color, #C0392B);
  stroke-width: 3;
  opacity: 1;
}
/* 已启用高亮时，弱化非高亮连线，让分支结构更清晰突出 */
.ftc-has-hl .ftc-edge:not(.ftc-edge-hl) {
  opacity: 0.28;
}
/* 高亮分支节点：文字强调 */
.ftc-node-hl .ftc-node-text { fill: var(--ftc-text-hl-color, #C0392B); font-weight: 700; }
.ftc-error, .ftc-empty, .ftc-overload {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ftc-hint-color, #9A7D5C);
}
.ftc-toolbar { margin-bottom: 8px; }
.ftc-canvas { position: relative; width: 100%; height: 100%; }
.ftc-metrics {
  position: absolute;
  bottom: 8px;
  left: 8px;
  font-size: 12px;
  color: var(--ftc-hint-color, #8A6F55);
  background: var(--ftc-bg, #FFFCF3);
  padding: 2px 8px;
  border-radius: 4px;
}
</style>