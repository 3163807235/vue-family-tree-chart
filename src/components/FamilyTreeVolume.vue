<script setup lang="ts">
// 成册渲染组件：按 VolumeResult 逐叶绘制（封面、扉页、总目、竖排文本、图版、世系图、世系录）
// 版框、乌丝栏、版心鱼尾、书眉、叶码均自立绘制，与 FamilyTreeBook 同一版刻行款。
import { computed, shallowRef } from 'vue'
import { assembleVolume } from '../core/volume/assemble'
import { layoutSpineTitle } from '../core/volume/paginate'
import { treeGenerationLabel, treeNameSpans, treeNodeExtras } from '../core/volume/treeTiles'
import type { CustomRenderer, VolumePage, VolumePlan } from '../core/volume/types'
import type { TreeTile } from '../core/volume/types'
import type { BookPage, NameFormatter } from '../core/types'

const props = defineProps<{
  /** 成册计划（createVolumePlan 产出，可用 insertChapter 等 API 编排） */
  plan: VolumePlan
  /** 自定义章节渲染器，键为章节 id 或 kind */
  customRenderers?: Record<string, CustomRenderer>
  /** 姓名展示变换钩子；统一应用于世系图、世系录、传记标题与人物索引 */
  nameFormatter?: NameFormatter
}>()

const emit = defineEmits<{
  (e: 'navigate', payload: { leafIndex: number; chapterId: string }): void
  (e: 'page-click', payload: { leafIndex: number }): void
}>()

const result = computed(() => assembleVolume(props.plan, {
  customRenderers: props.customRenderers,
  nameFormatter: props.nameFormatter
}))

/** 正文字体只作用于正文与署名，章节标题继续使用标题字体/系统默认 */
const bodyFontFamily = computed(() => props.plan.fonts?.bodyFontFamily || undefined)

/** 世系录字号（取自该章 options，缺省与 FamilyTreeBook 默认一致） */
const regStyle = computed(() => {
  const ch = props.plan.chapters.find(c => c.content.type === 'register')
  const opt = ch && ch.content.type === 'register' ? ch.content.options : undefined
  return {
    nameSize: opt?.nameSize ?? 28,
    bioSize: opt?.bioSize ?? 14,
    nameFontFamily: opt?.nameFontFamily || undefined,
    nameFontWeight: opt?.nameFontWeight ?? 'bold',
    bioFontFamily: opt?.bioFontFamily || undefined
  }
})

/** 半叶单列宽（世系标签墨牌宽度约束用） */
const halfColW = computed(() => {
  const p = result.value.pages[0]
  return p ? (p.frame.right - p.spine.right) / 10 : 0
})

const genMaxLen = computed(() => {
  let m = 1
  for (const p of result.value.pages) {
    if (!p.register) continue
    for (const g of p.register.genLabels) m = Math.max(m, g.chars.length)
  }
  return m
})
const genBadgeW = computed(() => Math.min(halfColW.value - 10, regStyle.value.nameSize + 20))
const genBadgeH = computed(
  () => (genMaxLen.value - 1) * regStyle.value.nameSize * 1.15 + regStyle.value.nameSize * 0.9 * 2
)
const genBadgeRadius = computed(() => Math.min(regStyle.value.nameSize * 0.35, genBadgeW.value / 2 - 0.5))

/** 句读点颜色（来自 plan.punct.color），未配置则 undefined（继承正文墨色） */
const punctColor = computed(() => props.plan.punct?.color || undefined)
/** 标点字符着色：仅标点字符且配置了颜色时覆盖 */
const fillOf = (c: { punct?: boolean }): string | undefined =>
  c.punct ? punctColor.value : undefined

/** 中缝书名最大字号 */
const SPINE_TITLE_MAX_SIZE = 50

/**
 * 中缝书名排版（共用 layoutSpineTitle）：上下拉伸填满容器、左右限幅拉宽并留白，始终单列居中。
 * 几何取自第一页——全书每页版心一致，故可复用同一布局。
 */
const spineLayout = computed(() => {
  const page = result.value.pages[0]
  if (!page) return null
  const tailHalfH = (page.spine.width * 0.6876) / 2
  return layoutSpineTitle(
    page.frame.top + 10,
    page.spine.upperTailY - tailHalfH,
    page.spine.width,
    props.plan.title || '',
    { maxSize: SPINE_TITLE_MAX_SIZE, maxScaleX: 1.7, horizPad: 6, vertPad: 8 }
  )
})
const spineTitle = computed(() => spineLayout.value?.chars ?? [])
/** 中缝书名字号（供模板绑定） */
const spineTitleSize = computed(() => spineLayout.value?.size ?? SPINE_TITLE_MAX_SIZE)
/** 中缝书名横向拉伸倍数（供模板 scaleX，≥1） */
const spineTitleScaleX = computed(() => spineLayout.value?.scaleX ?? 1)

function frameBox(page: VolumePage) {
  return {
    innerX: page.frame.left + 5,
    innerY: page.frame.top + 5,
    innerW: page.frame.right - page.frame.left - 10,
    innerH: page.frame.bottom - page.frame.top - 10
  }
}

/**
 * 同一叶两幅的纵向偏移（世界单位）：筒子页左右两半同版对读，
 * 同代带切出的两幅以较浅一幅的首行为基准，把较深一幅整体下移，使同一世代左右齐平；
 * 跨代带续排（各自顶格成幅）不施偏移。
 */
function treeOffsets(page: VolumePage) {
  const r = page.tree
  const l = page.treeLeft
  if (!r || !l || r.bandStart !== l.bandStart) return { right: 0, left: 0 }
  const ref = Math.min(r.topY, l.topY)
  return { right: r.topY - ref, left: l.topY - ref }
}

/**
 * 世系图缩放：锁定显示字号——主/辅字号即最终屏幕字号（比例恒为 1），
 * 间距、节点容量只影响分幅与页数（超宽超高由 sliceTree 按半叶尺寸自动多切一幅），不再带动字号变化。
 * 仅在极端情况下（如单行世代高过版框、无法再继续切分）才兜底缩小，避免文字越出版框。
 */
const treeScale = computed(() => {
  const gap = 6
  let s = Infinity
  for (const p of result.value.pages) {
    if (!p.tree && !p.treeLeft) continue
    const f = frameBox(p)
    const halfW = Math.min(
      p.spine.left - gap - f.innerX,
      p.frame.right - 5 - (p.spine.right + gap)
    )
    const offs = treeOffsets(p)
    for (const t of [p.tree, p.treeLeft]) {
      if (!t) continue
      const b = t.bounds
      const off = t === p.tree ? offs.right : offs.left
      s = Math.min(
        s,
        f.innerH / Math.max(1, off + b.maxY - b.minY),
        halfW / Math.max(1, b.maxX - b.minX)
      )
    }
  }
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(1, s)
})

/** 半叶世系图取景区：一幅只排在一页之内（右半叶=奇数页，左半叶=偶数页），不跨中缝；同一叶两幅共用统一比例 */
function treeBoxes(page: VolumePage) {
  const f = frameBox(page)
  const gap = 6
  const s = treeScale.value
  const offs = treeOffsets(page)
  const out: Array<{ key: string; tile: TreeTile; x: number; y: number; w: number; h: number }> = []
  if (page.tree) {
    const left = page.spine.right + gap
    const halfW = Math.max(1, page.frame.right - 5 - left)
    const w = Math.max(1, (page.tree.bounds.maxX - page.tree.bounds.minX) * s)
    const h = Math.max(1, (page.tree.bounds.maxY - page.tree.bounds.minY) * s)
    out.push({
      key: 'right',
      tile: page.tree,
      x: left + (halfW - w) / 2,
      y: f.innerY + offs.right * s,
      w,
      h
    })
  }
  if (page.treeLeft) {
    const halfW = Math.max(1, page.spine.left - gap - f.innerX)
    const w = Math.max(1, (page.treeLeft.bounds.maxX - page.treeLeft.bounds.minX) * s)
    const h = Math.max(1, (page.treeLeft.bounds.maxY - page.treeLeft.bounds.minY) * s)
    out.push({
      key: 'left',
      tile: page.treeLeft,
      x: f.innerX + (halfW - w) / 2,
      y: f.innerY + offs.left * s,
      w,
      h
    })
  }
  return out
}

/**
 * 右侧版框世代标签栏：本幅出现的每个世代均显示，标签靠近每半叶右内缘并与该世对齐。
 * 同幅同世共用一枚标签，避免相同标签在版框边重复重叠。
 */
function treeRailLabels(
  page: VolumePage,
  tb: { key: string; tile: TreeTile; x: number; y: number; w: number; h: number }
) {
  const s = treeScale.value
  const rightEdge = tb.key === 'right' ? page.frame.right - 5 : page.spine.left - 6
  const seen = new Set<number>()
  const out = []
  for (const n of tb.tile.nodes) {
    const label = treeGenerationLabel(n)
    if (!label || seen.has(n.depth)) continue
    seen.add(n.depth)
    const w = label.width * s
    const h = label.height * s
    const x = rightEdge - 8 - w
    const centerY = tb.y + (n.y - tb.tile.bounds.minY) * s
    out.push({
      depth: n.depth,
      text: label.text,
      x,
      y: centerY - h / 2,
      width: w,
      height: h,
      radius: label.radius * s,
      border: Math.max(0.5, label.border * s),
      fontSize: label.fontSize * s,
      chars: label.chars.map(c => ({ ch: c.ch, x: x + w / 2, y: centerY + c.y * s }))
    })
  }
  return out.sort((a, b) => a.depth - b.depth)
}

/** 半叶取景框：按本幅包围盒等比取景 */
function treeViewBox(tile: TreeTile): string {
  const b = tile.bounds
  return `${b.minX} ${b.minY} ${Math.max(1, b.maxX - b.minX)} ${Math.max(1, b.maxY - b.minY)}`
}

/** 世系图节点绘制计划：节点 + 排行/承继/配偶的竖排版式（仅展示层计算） */
function treePlans(t: TreeTile) {
  const aux = { showRank: t.showRank, showInherit: t.showInherit, spouseFormat: t.spouseFormat }
  return t.nodes.map(n => ({ n, ex: treeNodeExtras(n, t.mainSize, t.auxSize, aux) }))
}

function onTocClick(page: VolumePage) {
  emit('page-click', { leafIndex: page.leafIndex })
}

/** 纸幅（版框外缘至纸边各留 margin） */
// 页面物理尺寸直接取自引擎（天地 margin 可不对称，不能由 frame 反推）
const pageW = (page: VolumePage) => page.pageWidth
const pageH = (page: VolumePage) => page.pageHeight

/** 是否为封面页：整版题字，不绘版框与版心骨架，仅以虚线示意中缝 */
const isCoverPage = (page: VolumePage) => page.cover?.mode === 'cover'

/** 版框是否绘制：封面不设边框；扉页及正文各页照绘 */
const hasFrame = (page: VolumePage) => !isCoverPage(page)

/** 版心页码：竖排定字号 18px，逐字下排（行距 1.15×字号） */
const PAGE_NO_SIZE = 18
const PAGE_NO_LINE_H = PAGE_NO_SIZE * 1.15
const PAGE_NO_SIDES: Array<'left' | 'right'> = ['left', 'right']

/** 取某一侧半叶的页码字列：左栏居版心左半，右栏居版心右半，自下鱼尾下方逐字下排 */
const pageNoChars = (page: VolumePage, side: 'left' | 'right') => {
  const text = side === 'left' ? page.pageNumberLeft : page.pageNumberRight
  const x = side === 'left'
    ? page.spine.centerX - page.spine.width / 4
    : page.spine.centerX + page.spine.width / 4
  return Array.from(text).map((ch, i) => ({
    ch,
    x,
    y: page.spine.lowerTailY + 40 + PAGE_NO_LINE_H * (i + 0.5)
  }))
}

/** 章节首叶叶序 */
function leafOfChapter(chapterId: string): number {
  return result.value.chapterSpans.find(s => s.chapterId === chapterId)?.startLeaf ?? -1
}

/** 人物定位：register/bio/tree 三种目标 */
function leafOfPerson(personId: string, target: 'register' | 'bio' | 'tree' = 'register'): number {
  const entry = result.value.personIndex.find(e => e.personId === personId)
  if (!entry) return -1
  const leafNumber = target === 'bio' ? entry.bioLeaf : target === 'tree' ? entry.treeLeaf : entry.registerLeaf
  if (!leafNumber) return -1
  return result.value.pages.findIndex(p => p.leafNumber === leafNumber)
}

const pageSvgs = shallowRef<SVGSVGElement[]>([])

/** 导出指定叶（leafIndex，自 0 起）的独立 SVG 标记；不包含 PDF、下载或权限逻辑。 */
function getPageSvg(index: number): string {
  const svg = pageSvgs.value[index]
  if (!svg) throw new RangeError(`叶索引 ${index} 无效，当前共 ${pageSvgs.value.length} 叶`)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(clone)
}

defineExpose({ result, leafOfChapter, leafOfPerson, getPageSvg })

/** 世系录页内栏线过滤（版心两界另绘黑线） */
function gridLines(page: VolumePage): number[] {
  const bp = page.register
  if (!bp) return page.gridXs
  return page.gridXs.filter(x => Math.abs(x - bp.spine.left) > 0.5 && Math.abs(x - bp.spine.right) > 0.5)
}
</script>

<template>
  <div class="ftc-volume">
    <div
      v-for="page in result.pages"
      :key="page.leafIndex"
      class="ftc-volume-page"
      :style="{ width: pageW(page) + 'px', height: pageH(page) + 'px' }"
      @click="onTocClick(page)"
    >
      <svg
        ref="pageSvgs"
        :width="pageW(page)"
        :height="pageH(page)"
        :viewBox="`0 0 ${pageW(page)} ${pageH(page)}`"
        xmlns="http://www.w3.org/2000/svg"
        class="ftc-volume-svg"
      >
        <!-- ===== 版框（四周双边）：封面不绘，扉页及正文各页照绘 ===== -->
        <g v-if="hasFrame(page)">
          <rect :x="page.frame.left" :y="page.frame.top"
                :width="page.frame.right - page.frame.left"
                :height="page.frame.bottom - page.frame.top"
                fill="none" stroke="#1a1208" stroke-width="3.02" />
          <rect :x="page.frame.left + 5" :y="page.frame.top + 5"
                :width="page.frame.right - page.frame.left - 10"
                :height="page.frame.bottom - page.frame.top - 10"
                fill="none" stroke="#1a1208" stroke-width="1.51" />
        </g>

        <!-- ===== 乌丝栏竖界行 ===== -->
        <g v-if="page.gridXs.length" stroke="#1a1208" stroke-width="1.51" opacity="0.28">
          <line v-for="(x, i) in gridLines(page)" :key="'gx' + i"
                :x1="x" :x2="x" :y1="page.frame.top + 5" :y2="page.frame.bottom - 5" />
        </g>
        <!-- 版心两界：黑口实线（每页版心固有结构，与乌丝栏/gridXs 无关；封面无版心，扉页照绘） -->
        <g v-if="hasFrame(page)" stroke="#1a1208" stroke-width="1.51">
          <line :x1="page.spine.left" :x2="page.spine.left" :y1="page.frame.top + 5" :y2="page.frame.bottom - 5" />
          <line :x1="page.spine.right" :x2="page.spine.right" :y1="page.frame.top + 5" :y2="page.frame.bottom - 5" />
        </g>

        <!-- ===== 封面虚线中线（对折中缝示意，替代封面上的版心骨架） ===== -->
        <line v-if="isCoverPage(page)"
              :x1="page.spine.centerX" :x2="page.spine.centerX"
              :y1="0" :y2="pageH(page)"
              stroke="#1a1208" stroke-width="1" stroke-dasharray="8 6" opacity="0.35" />

        <!-- ===== 装订线与装订标识（筒子页展平：左右半叶各一条装订线，对折后重合于书脊） ===== -->
        <g v-if="page.spine.binding" class="ftc-volume-binding">
          <template v-for="(lineX, li) in page.spine.binding.lineXs" :key="'bl' + li">
            <!-- 装订线（虚线：纵贯纸张全高，标明是纸张级装订位置，与版框/版心骨架无关） -->
            <line
              v-if="page.spine.binding.type !== 'perfect'"
              :x1="lineX" :x2="lineX"
              :y1="0" :y2="pageH(page)"
              stroke="#6b4a2a" stroke-width="1" stroke-dasharray="4 3" opacity="0.55" />
            <!-- 骑马钉：实心圆钉点 + 横向钉脚 -->
            <g v-if="page.spine.binding.type === 'staple' && page.spine.binding.stapleY" fill="#2a1a08">
              <circle v-for="(y, i) in page.spine.binding.stapleY" :key="'st' + li + i"
                      :cx="lineX" :cy="y" r="2.5" />
              <line v-for="(y, i) in page.spine.binding.stapleY" :key="'sw' + li + i"
                    :x1="lineX - 6" :x2="lineX + 6"
                    :y1="y" :y2="y" stroke="#2a1a08" stroke-width="1.2" />
            </g>
            <!-- 锁线装订：小槽孔（空心方洞，模拟锁线机打孔） -->
            <g v-if="page.spine.binding.type === 'sewing' && page.spine.binding.sewingY"
               fill="#fffdf7" stroke="#2a1a08" stroke-width="0.8">
              <rect v-for="(y, i) in page.spine.binding.sewingY" :key="'sh' + li + i"
                    :x="lineX - 2" :y="y - 1.5"
                    width="4" height="3" />
            </g>
          </template>
        </g>

        <!-- ===== 世系录横格线（按人物格宽画段） ===== -->
        <g v-if="page.register" stroke="#1a1208" stroke-width="1.51" opacity="0.28">
          <template v-for="(p, pi) in page.register.people" :key="'row' + pi + p.id">
            <line v-for="(y, i) in page.register.rowLines" :key="i"
                  :x1="Math.max(p.x, page.frame.left + 5)"
                  :x2="Math.min(p.x + p.width, page.frame.right - 5)"
                  :y1="y" :y2="y" />
          </template>
        </g>

        <!-- ===== 版心：书名、鱼尾、叶码（封面无版心） ===== -->
        <g v-if="hasFrame(page)" class="ftc-volume-spine">
          <!-- 书名：左右以版心中线为轴做限幅拉伸（scaleX），保持居中、单列 -->
          <g :transform="`translate(${page.spine.centerX},0) scale(${spineTitleScaleX},1) translate(${-page.spine.centerX},0)`">
            <text text-anchor="middle" :style="{ fontSize: spineTitleSize + 'px', fill: '#1a1208', fontWeight: 600 }">
              <tspan v-for="(c, i) in spineTitle" :key="'st' + i" :x="page.spine.centerX" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </g>
          <g :transform="`translate(${page.spine.centerX}, ${page.spine.upperTailY})`">
            <rect :x="-page.spine.width / 2 + 1" :y="-(page.spine.width * 0.6876) / 2"
                  :width="page.spine.width - 2" :height="page.spine.width * 0.6876" fill="#fffdf7" />
            <polygon points="45.35,31.18 22.68,15.59 0,31.18 0,0 45.35,0"
                     :transform="`translate(${-page.spine.width / 2}, ${-(page.spine.width * 0.6876) / 2}) scale(${page.spine.width / 45.35})`"
                     fill="#1a1208" />
          </g>
          <g :transform="`translate(${page.spine.centerX}, ${page.spine.lowerTailY}) scale(1, -1)`">
            <rect :x="-page.spine.width / 2 + 1" :y="-(page.spine.width * 0.6876) / 2"
                  :width="page.spine.width - 2" :height="page.spine.width * 0.6876" fill="#fffdf7" />
            <polygon points="45.35,31.18 22.68,15.59 0,31.18 0,0 45.35,0"
                     :transform="`translate(${-page.spine.width / 2}, ${-(page.spine.width * 0.6876) / 2}) scale(${page.spine.width / 45.35})`"
                     fill="#1a1208" />
          </g>
        </g>

        <!-- ===== 页码（版心原位竖排分栏：左栏偶数页、右栏奇数页，字号统一 18px） ===== -->
        <g v-if="page.pageNumberLeft" class="ftc-volume-pageno">
          <text v-for="side in PAGE_NO_SIDES" :key="side" text-anchor="middle"
                :style="{ fontSize: PAGE_NO_SIZE + 'px', fill: '#1a1208' }">
            <tspan v-for="(c, i) in pageNoChars(page, side)" :key="side + i"
                   :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
        </g>

        <!-- ===== 书眉（天头） ===== -->
        <text v-if="page.runningTitle && page.leafNumber" :x="page.frame.right" :y="page.frame.top - 22"
              text-anchor="end" class="ftc-volume-running">{{ page.runningTitle }}</text>

        <!-- ===== 封面 / 扉页 ===== -->
        <g v-if="page.cover" class="ftc-volume-cover">
          <text text-anchor="middle" :style="{ fontSize: page.cover.titleSize + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in page.cover.titleChars" :key="'ct' + i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-if="page.cover.clanChars.length" text-anchor="middle"
                :style="{ fontSize: page.cover.clanSize + 'px', fill: '#3a2a1a' }">
            <tspan v-for="(c, i) in page.cover.clanChars" :key="'cl' + i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(col, ci) in page.cover.metaCols" :key="'cm' + ci" text-anchor="middle"
                :style="{ fontSize: page.cover.metaSize + 'px', fill: '#3a2a1a' }">
            <tspan v-for="(c, i) in col" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
        </g>

        <!-- ===== 总目 ===== -->
        <g v-else-if="page.toc" class="ftc-volume-toc">
          <text v-if="page.toc.heading" text-anchor="middle"
                :style="{ fontSize: page.toc.heading.size + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in page.toc.heading.chars" :key="'th' + i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <g v-for="e in page.toc.entries" :key="e.entryId">
            <!-- 点击条目跳转该章首叶 -->
            <rect :x="e.x - e.size * 0.7" :y="page.frame.top" :width="e.size * 1.4"
                  :height="page.frame.bottom - page.frame.top" fill="transparent" style="cursor: pointer"
                  @click.stop="emit('navigate', { leafIndex: e.leafIndex, chapterId: e.chapterId })" />
            <!-- 标题与页码之间的竖直虚线引导（一线到底，格内居中于列轴） -->
            <line v-if="e.leader" :x1="e.leader.x" :x2="e.leader.x"
                  :y1="e.leader.y1" :y2="e.leader.y2"
                  stroke="#1a1208" stroke-width="1" stroke-dasharray="2 3" opacity="0.45" />
            <!-- 标题：格子顶部 -->
            <text text-anchor="middle" :style="{ fontSize: e.size + 'px', fill: '#1a1208' }">
              <tspan v-for="(c, i) in e.chars" :key="i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <!-- 页码：格子底部 -->
            <text text-anchor="middle" :style="{ fontSize: e.size + 'px', fill: '#1a1208' }">
              <tspan v-for="(c, i) in e.pageNoChars" :key="'p' + i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </g>
        </g>

        <!-- ===== 竖排文本（序跋、凡例、传记、艺文等） ===== -->
        <g v-else-if="page.text" class="ftc-volume-text">
          <text v-if="page.text.heading" text-anchor="middle"
                :style="{ fontSize: page.text.heading.size + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in page.text.heading.chars" :key="'h' + i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(col, ci) in page.text.columns" :key="'c' + ci" text-anchor="middle"
                :style="{ fontSize: col.size + 'px', fill: '#1a1208', fontFamily: bodyFontFamily }">
            <tspan v-for="(c, i) in col.chars" :key="i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(s, si) in page.text.subheadings" :key="'s' + si" text-anchor="middle"
                :style="{ fontSize: s.size + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in s.chars" :key="i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(s, si) in page.text.signatures" :key="'sg' + si" text-anchor="middle"
                :style="{ fontSize: s.size + 'px', fill: '#3a2a1a', fontFamily: bodyFontFamily }">
            <tspan v-for="(c, i) in s.chars" :key="i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
        </g>

        <!-- ===== 图版（single 通版 / double 双联，缺图占位） ===== -->
        <g v-else-if="page.plates && page.plates.length" class="ftc-volume-plates">
          <template v-for="p in page.plates" :key="p.plateId">
            <rect v-if="p.frame" :x="p.x" :y="p.y" :width="p.width" :height="p.height"
                  fill="none" stroke="#1a1208" stroke-width="1.51" />
            <image v-if="p.src" :href="p.src" :x="p.x" :y="p.y" :width="p.width" :height="p.height"
                   :preserveAspectRatio="p.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'" />
            <text v-else text-anchor="middle" dominant-baseline="central"
                  :x="p.x + p.width / 2" :y="p.y + p.height / 2"
                  style="font-size: 22px; fill: #6b5842;">图版待补</text>
            <text text-anchor="middle" :style="{ fontSize: p.titleSize + 'px', fill: '#1a1208', fontWeight: 600 }">
              <tspan v-for="(c, i) in p.titleChars" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text v-if="p.captionChars.length" text-anchor="middle"
                  :style="{ fontSize: p.captionSize + 'px', fill: '#3a2a1a' }">
              <tspan v-for="(c, i) in p.captionChars" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </template>
        </g>

        <!-- ===== 世系图（一叶两幅：先右半叶奇数页、后左半叶偶数页，各幅只排在本页之内） ===== -->
        <template v-else-if="page.tree || page.treeLeft">
          <!-- 书眉：两半叶各在自己的外口标本幅题名 -->
          <text v-if="page.tree" :x="page.frame.right" :y="page.frame.top - 22"
                text-anchor="end" class="ftc-volume-running">{{ page.chapterTitle }}　{{ page.tree.label }}</text>
          <text v-if="page.treeLeft" :x="page.frame.left" :y="page.frame.top - 22"
                text-anchor="start" class="ftc-volume-running">{{ page.chapterTitle }}　{{ page.treeLeft.label }}</text>
          <svg v-for="tb in treeBoxes(page)" :key="'tree-' + tb.key" :x="tb.x" :y="tb.y"
               :width="tb.w" :height="tb.h" :viewBox="treeViewBox(tb.tile)"
               preserveAspectRatio="xMidYMin meet" class="ftc-volume-tree">
            <g stroke="#A97F4F" stroke-width="2" fill="none" opacity="0.7">
              <path v-for="(e, i) in tb.tile.edges" :key="'e' + i" :d="e.d" />
            </g>
            <!-- 姓名竖排：逐字下落于节点中心列（版式与图画 DefaultNode 一致） -->
            <g v-for="it in treePlans(tb.tile)" :key="'n' + it.n.id">
              <text text-anchor="middle"
                    :style="{ fontSize: tb.tile.mainSize + 'px', fill: '#1a1208', fontWeight: 600 }">
                <tspan v-for="(c, i) in treeNameSpans(it.n.name, tb.tile.mainSize).chars" :key="i"
                       :x="it.n.x" :y="it.n.y + c.y" dominant-baseline="central">{{ c.ch }}</tspan>
              </text>
              <!-- 排行（姓名右侧）/ 承继（姓名左侧）：竖排小字 -->
              <text v-if="it.ex.rank.length" text-anchor="middle" style="font-size: 9px; fill: #6b4a2a">
                <tspan v-for="(c, i) in it.ex.rank" :key="i"
                       :x="it.n.x + 8" :y="it.n.y + c.y" dominant-baseline="central">{{ c.ch }}</tspan>
              </text>
              <text v-if="it.ex.inherit.length" text-anchor="middle" style="font-size: 9px; fill: #6b4a2a">
                <tspan v-for="(c, i) in it.ex.inherit" :key="i"
                       :x="it.n.x - 8" :y="it.n.y + c.y" dominant-baseline="central">{{ c.ch }}</tspan>
              </text>
              <!-- 配偶：姓名右侧逐列竖排 -->
              <text v-for="(sp, si) in it.ex.spouses" :key="'sp' + si" text-anchor="middle"
                    :style="{ fontSize: tb.tile.auxSize + 'px', fill: '#3a2a1a' }">
                <tspan v-for="(c, i) in sp.chars" :key="i"
                       :x="it.n.x + sp.x" :y="it.n.y + c.y" dominant-baseline="central">{{ c.ch }}</tspan>
              </text>
            </g>
          </svg>
          <!-- 靠近右侧版框的逐世标签栏：本幅所有世代均显示 -->
          <g v-for="tb in treeBoxes(page)" :key="'gen-rail-' + tb.key" class="ftc-volume-leaf-gen">
            <g v-for="label in treeRailLabels(page, tb)" :key="'leaf-gen-' + tb.key + '-' + label.depth">
              <rect :x="label.x" :y="label.y" :width="label.width" :height="label.height"
                    :rx="label.radius" :ry="label.radius"
                    fill="#FFF2DE" stroke="#D9A46A" :stroke-width="label.border" />
              <text text-anchor="middle"
                    :style="{
                      fontSize: label.fontSize + 'px',
                      fill: '#9C3E28',
                      fontWeight: 600,
                      fontFamily: `'PingFang SC', 'Microsoft YaHei', sans-serif`
                    }">
                <tspan v-for="(c, i) in label.chars" :key="i"
                       :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
              </text>
            </g>
          </g>
        </template>

        <!-- ===== 世系录（牒记式，复用 BookPage 数据） ===== -->
        <g v-else-if="page.register" class="ftc-volume-register">
          <!-- 书眉格：章首叶最外一列竖排章名（引擎首叶右半叶留 9 轨，此格专用，与 FamilyTreeBook 书眉一致） -->
          <text v-if="page.register.hasHeader && page.runningTitle" text-anchor="middle"
                :style="{ fontSize: '34.67px', fill: '#3a2a1a', fontWeight: 600 }">
            <tspan v-for="(ch, i) in Array.from(page.runningTitle)" :key="'rh' + i"
                   :x="page.frame.right - halfColW / 2"
                   :y="page.frame.top + 36 + i * 42">{{ ch }}</tspan>
          </text>
          <g v-for="(bp, pi) in page.register.genLabels" :key="'gen' + pi" class="ftc-volume-genlabel">
            <rect :x="bp.chars[0].x - genBadgeW / 2"
                  :y="(page.frame.top + page.frame.bottom) / 2 - genBadgeH / 2"
                  :width="genBadgeW" :height="genBadgeH"
                  :rx="genBadgeRadius" :ry="genBadgeRadius" fill="#1a1208" />
            <text text-anchor="middle"
                  :style="{ fontSize: regStyle.nameSize + 'px', fill: '#FFFFFF', fontWeight: regStyle.nameFontWeight, fontFamily: regStyle.nameFontFamily }">
              <tspan v-for="(c, i) in bp.chars" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </g>
          <g v-for="(p, pi) in page.register.people" :key="'p' + pi + p.id">
            <text v-if="p.labelChars.length" text-anchor="middle"
                  :style="{ fontSize: regStyle.bioSize + 'px', fill: '#3a2a1a', fontFamily: regStyle.bioFontFamily }">
              <tspan v-for="(c, i) in p.labelChars" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text text-anchor="middle"
                  :style="{ fontSize: regStyle.nameSize + 'px', fill: '#1a1208', fontWeight: regStyle.nameFontWeight, fontFamily: regStyle.nameFontFamily }">
              <tspan v-for="(c, i) in p.nameChars" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text v-if="p.contMarkChars.length" text-anchor="middle"
                  :style="{ fontSize: regStyle.bioSize + 'px', fill: '#3a2a1a', fontFamily: regStyle.bioFontFamily }">
              <tspan v-for="(c, i) in p.contMarkChars" :key="i" :x="c.x" :y="c.y" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text v-if="p.bioChars.length" text-anchor="middle"
                  :style="{ fontSize: regStyle.bioSize + 'px', fill: '#3a2a1a', fontFamily: regStyle.bioFontFamily }">
              <tspan v-for="(c, i) in p.bioChars" :key="i" :x="c.x + (c.dx || 0)" :y="c.y + (c.dy || 0)" :font-size="c.size" :fill="fillOf(c)" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.ftc-volume {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  width: fit-content;
  min-width: calc(100% - 48px);
  margin: 0 auto;
  padding: 24px;
  background: #f4efe6;
}
.ftc-volume-page {
  background: #fffdf7;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.ftc-volume-svg {
  display: block;
  background: #fffdf7;
}
.ftc-volume-running {
  font-size: 16px;
  fill: #6b5842;
  font-weight: 600;
}
@media print {
  .ftc-volume {
    padding: 0;
    gap: 0;
    background: none;
  }
  .ftc-volume-page {
    box-shadow: none;
    break-after: page;
    page-break-after: always;
  }
  @page {
    size: 1587px 1123px;
    margin: 0;
  }
}
</style>
