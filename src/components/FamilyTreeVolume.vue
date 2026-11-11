<script setup lang="ts">
// 成册渲染组件：按 VolumeResult 逐叶绘制（封面、扉页、总目、竖排文本、图版、世系图、世系录）
// 版框、乌丝栏、版心鱼尾、书眉、叶码均自立绘制，与 FamilyTreeBook 同一版刻行款。
import { computed } from 'vue'
import { assembleVolume } from '../core/volume/assemble'
import type { CustomRenderer, VolumePage, VolumePlan } from '../core/volume/types'
import type { BookPage } from '../core/types'

const props = defineProps<{
  /** 成册计划（createVolumePlan 产出，可用 insertChapter 等 API 编排） */
  plan: VolumePlan
  /** 自定义章节渲染器，键为章节 id 或 kind */
  customRenderers?: Record<string, CustomRenderer>
}>()

const emit = defineEmits<{
  (e: 'navigate', payload: { leafIndex: number; chapterId: string }): void
  (e: 'page-click', payload: { leafIndex: number }): void
}>()

const result = computed(() => assembleVolume(props.plan, { customRenderers: props.customRenderers }))

/** 世系录字号（取自该章 options，缺省与 FamilyTreeBook 默认一致） */
const regStyle = computed(() => {
  const ch = props.plan.chapters.find(c => c.content.type === 'register')
  const opt = ch && ch.content.type === 'register' ? ch.content.options : undefined
  return { nameSize: opt?.nameSize ?? 28, bioSize: opt?.bioSize ?? 14 }
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

/** 版心书名字号（字距随字号联动） */
const SPINE_TITLE_SIZE = 50

/** 版心书名（竖排，位于内栏顶至鱼尾之间） */
const spineTitle = computed(() => {
  const size = SPINE_TITLE_SIZE
  const lh = size * 1
  const top = (result.value.pages[0]?.frame.top ?? 0) + 40
  return Array.from(props.plan.title || '').map((ch, i) => ({ ch, y: top + i * lh }))
})

function treeViewBox(page: VolumePage): string {
  const t = page.tree
  if (!t) return '0 0 1 1'
  const b = t.bounds
  return `${b.minX} ${b.minY} ${Math.max(1, b.maxX - b.minX)} ${Math.max(1, b.maxY - b.minY)}`
}

function frameBox(page: VolumePage) {
  return {
    innerX: page.frame.left + 5,
    innerY: page.frame.top + 5,
    innerW: page.frame.right - page.frame.left - 10,
    innerH: page.frame.bottom - page.frame.top - 10
  }
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

defineExpose({ result, leafOfChapter, leafOfPerson })

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
          <text text-anchor="middle" :style="{ fontSize: SPINE_TITLE_SIZE + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in spineTitle" :key="'st' + i" :x="page.spine.centerX" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
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
            <tspan v-for="(c, i) in page.cover.titleChars" :key="'ct' + i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-if="page.cover.clanChars.length" text-anchor="middle"
                :style="{ fontSize: page.cover.clanSize + 'px', fill: '#3a2a1a' }">
            <tspan v-for="(c, i) in page.cover.clanChars" :key="'cl' + i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(col, ci) in page.cover.metaCols" :key="'cm' + ci" text-anchor="middle"
                :style="{ fontSize: page.cover.metaSize + 'px', fill: '#3a2a1a' }">
            <tspan v-for="(c, i) in col" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
        </g>

        <!-- ===== 总目 ===== -->
        <g v-else-if="page.toc" class="ftc-volume-toc">
          <text v-if="page.toc.heading" text-anchor="middle"
                :style="{ fontSize: page.toc.heading.size + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in page.toc.heading.chars" :key="'th' + i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <g v-for="e in page.toc.entries" :key="e.entryId">
            <!-- 点击条目跳转该章首叶 -->
            <rect :x="e.x - e.size * 0.7" :y="page.frame.top" :width="e.size * 1.4"
                  :height="page.frame.bottom - page.frame.top" fill="transparent" style="cursor: pointer"
                  @click.stop="emit('navigate', { leafIndex: e.leafIndex, chapterId: e.chapterId })" />
            <text text-anchor="middle" :style="{ fontSize: e.size + 'px', fill: '#1a1208' }">
              <tspan v-for="(c, i) in e.chars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </g>
        </g>

        <!-- ===== 竖排文本（序跋、凡例、传记、艺文等） ===== -->
        <g v-else-if="page.text" class="ftc-volume-text">
          <text v-if="page.text.heading" text-anchor="middle"
                :style="{ fontSize: page.text.heading.size + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in page.text.heading.chars" :key="'h' + i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(col, ci) in page.text.columns" :key="'c' + ci" text-anchor="middle"
                :style="{ fontSize: col.size + 'px', fill: '#1a1208' }">
            <tspan v-for="(c, i) in col.chars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(s, si) in page.text.subheadings" :key="'s' + si" text-anchor="middle"
                :style="{ fontSize: s.size + 'px', fill: '#1a1208', fontWeight: 600 }">
            <tspan v-for="(c, i) in s.chars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
          <text v-for="(s, si) in page.text.signatures" :key="'sg' + si" text-anchor="middle"
                :style="{ fontSize: s.size + 'px', fill: '#3a2a1a' }">
            <tspan v-for="(c, i) in s.chars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
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
              <tspan v-for="(c, i) in p.titleChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text v-if="p.captionChars.length" text-anchor="middle"
                  :style="{ fontSize: p.captionSize + 'px', fill: '#3a2a1a' }">
              <tspan v-for="(c, i) in p.captionChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </template>
        </g>

        <!-- ===== 世系图（一叶一幅，按本幅包围盒取景） ===== -->
        <svg v-else-if="page.tree" :x="frameBox(page).innerX" :y="frameBox(page).innerY"
             :width="frameBox(page).innerW" :height="frameBox(page).innerH"
             :viewBox="treeViewBox(page)" preserveAspectRatio="xMidYMid meet" class="ftc-volume-tree">
          <g stroke="#A97F4F" stroke-width="2" fill="none" opacity="0.7">
            <path v-for="(e, i) in page.tree.edges" :key="'e' + i" :d="e.d" />
          </g>
          <text v-for="n in page.tree.nodes" :key="n.id" :x="n.x" :y="n.y"
                text-anchor="middle" dominant-baseline="central"
                :style="{ fontSize: page.tree.mainSize + 'px', fill: '#1a1208', fontWeight: 600 }">{{ n.name }}</text>
        </svg>

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
                  :style="{ fontSize: regStyle.nameSize + 'px', fill: '#FFFFFF', fontWeight: 'bold' }">
              <tspan v-for="(c, i) in bp.chars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
          </g>
          <g v-for="(p, pi) in page.register.people" :key="'p' + pi + p.id">
            <text v-if="p.labelChars.length" text-anchor="middle"
                  :style="{ fontSize: regStyle.bioSize + 'px', fill: '#3a2a1a' }">
              <tspan v-for="(c, i) in p.labelChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text text-anchor="middle"
                  :style="{ fontSize: regStyle.nameSize + 'px', fill: '#1a1208', fontWeight: 'bold' }">
              <tspan v-for="(c, i) in p.nameChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text v-if="p.contMarkChars.length" text-anchor="middle"
                  :style="{ fontSize: regStyle.bioSize + 'px', fill: '#3a2a1a' }">
              <tspan v-for="(c, i) in p.contMarkChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
            </text>
            <text v-if="p.bioChars.length" text-anchor="middle"
                  :style="{ fontSize: regStyle.bioSize + 'px', fill: '#3a2a1a' }">
              <tspan v-for="(c, i) in p.bioChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
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
