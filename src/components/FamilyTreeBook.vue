<!-- 谱牒式（牒记式）谱书渲染组件：按古籍筒子页版刻版式渲染 SVG 页面（A3 横向，版心对折为左右半叶） -->
<script setup lang="ts">
import { computed } from 'vue'
import { runBookLayout } from '../core/bookLayout'
import type { FamilyNode, BookLayoutOptions, BookPage } from '../core/types'

interface Props {
  data: FamilyNode
  pageWidth?: number
  pageHeight?: number
  /** 左右边距（版框距纸边） */
  margin?: number
  /** 天头：版框上留白 */
  topMargin?: number
  /** 地脚：版框下留白 */
  bottomMargin?: number
  nameSize?: number
  bioSize?: number
  /** 传文行距倍数（竖排换行时竖行间的左右间距），默认 1.15；行内上下字距固定 1.15 不受影响 */
  bioLineSpacing?: number
  /** 姓名大字字体族（本地系统字体，如 'SimSun' 'KaiTi' 'FangSong' 'SimHei'），默认浏览器默认字体 */
  nameFontFamily?: string
  /** 姓名大字字重（如 400 常规 / 'bold' 粗体），默认 bold；思源宋体 Regular 时应传 400 */
  nameFontWeight?: string | number
  /** 传文小字字体族（本地系统字体），默认浏览器默认字体 */
  bioFontFamily?: string
  /** @deprecated 已不生效：半叶十格自版框外缘至版心严格等分，书眉格即最右一格，与人物格同宽 */
  gridColWidth?: number
  /** 版心（书口）竖条宽度 */
  spineWidth?: number
  /** 谱名（版心竖排大字，如"测试家谱"） */
  title?: string
  /** 书眉（右缘单格竖排小字，如"测试世系简录"） */
  runningTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  // A3 横向（筒子页）：1587×1123
  pageWidth: 1587,
  pageHeight: 1123,
  margin: 64,
  topMargin: 76,
  bottomMargin: 56,
  nameSize: 28,
  bioSize: 14,
  bioLineSpacing: 1.15,
  nameFontFamily: '',
  nameFontWeight: 'bold',
  bioFontFamily: '',
  gridColWidth: 40,
  spineWidth: 60.47, // 中缝（版心）宽 16mm（96dpi：16×96/25.4≈60.47px）
  title: '',
  runningTitle: ''
})

// 书眉专用：思源宋体 SemiBold（600 半粗），本机已装 Source Han Serif CN；回退 Noto Serif SC / 系统宋体
const RUNNING_TITLE_FONT = "'Source Han Serif CN','思源宋体 CN','Noto Serif SC','SimSun',serif"

// 书名（版心竖排大字）专用：思源宋体 SemiBold 600、二号（22pt≈29.33px）；字行距 1.15 与全书紧排一致
const TITLE_FONT = "'Source Han Serif CN','思源宋体 CN','Noto Serif SC','SimSun',serif"
const titleFontSize = 45
const titleLineH = titleFontSize * 1.15
const titleChars = computed(() => (props.title ? props.title.split('') : []))

/**
 * 书名第 i 字的字心 y：整块在「内栏顶（frame.top+5）～上鱼尾顶缘」容器内上下居中。
 * 鱼尾半高须与模板多边形几何一致（鱼尾高＝版心宽×0.6876）。
 */
const titleCharY = (page: BookPage, i: number) => {
  const n = titleChars.value.length
  const tailHalfH = (page.spine.width * 0.6876) / 2
  const containerTop = page.frame.top + 5
  const containerBottom = page.spine.upperTailY - tailHalfH
  const blockCenterY = (containerTop + containerBottom) / 2
  return blockCenterY - ((n - 1) * titleLineH) / 2 + i * titleLineH
}

const options = computed<BookLayoutOptions>(() => ({
  pageWidth: props.pageWidth,
  pageHeight: props.pageHeight,
  margin: props.margin,
  topMargin: props.topMargin,
  bottomMargin: props.bottomMargin,
  nameSize: props.nameSize,
  bioSize: props.bioSize,
  bioLineSpacing: props.bioLineSpacing,
  gridColWidth: props.gridColWidth,
  spineWidth: props.spineWidth
}))

const book = computed(() => runBookLayout(props.data, options.value))

// 半叶等分格宽（须与 bookLayout 引擎一致）：自版框外缘至版心均分十格，
// 最右一格即书眉格（书眉竖排其中），人物格与之同宽
const halfColW = computed(() => {
  const p = book.value.pages[0]
  return p ? (p.frame.right - p.spine.right) / 10 : 40
})

// 世系墨牌几何（黑底圆角标签）：字行距须与引擎 centerVerticalChars 的 nameLineH 严格一致；
// 牌宽随字号（字宽+20px），收在格缘内 10px 不压竖界行；圆角随字号加大；
// 上下内边距放宽（0.9 字号）避免文字贴边——全书墨牌高度统一：
// 以全书字数最多的标签为准（如出现四字「第十一世」则全部按四字高），短标签牌内文字仍居中
const genNameLineH = computed(() => props.nameSize * 1.15)
const genBadgeW = computed(() => Math.min(halfColW.value - 10, props.nameSize + 20))
const genBadgePadY = computed(() => props.nameSize * 0.9)
// 圆角随字号加大（约 0.35 字号），并以牌宽之半为上限，保证四角圆润可见
const genBadgeRadius = computed(() =>
  Math.round(Math.min(props.nameSize * 0.35, genBadgeW.value / 2 - 0.5) * 10) / 10
)
// 全书最长世系标签字数（跨页统一牌高）
const genMaxLen = computed(() =>
  book.value.pages.reduce(
    (m, p) => p.genLabels.reduce((mm, g) => Math.max(mm, g.chars.length), m),
    0
  )
)
// 统一墨牌高度＝最长标签文字高＋上下内边距
const genBadgeH = computed(() =>
  Math.max(1, genMaxLen.value - 1) * genNameLineH.value + genBadgePadY.value * 2
)

</script>

<template>
  <div class="ftc-book">
    <div
      v-for="page in book.pages"
      :key="page.pageIndex"
      class="ftc-book-page"
      :style="{ width: page.width + 'px', height: page.height + 'px' }"
    >
      <svg
        :width="page.width"
        :height="page.height"
        :viewBox="`0 0 ${page.width} ${page.height}`"
        xmlns="http://www.w3.org/2000/svg"
        class="ftc-book-svg"
      >
        <!-- ===== 版框（四周双边） ===== -->
        <rect :x="page.frame.left" :y="page.frame.top"
              :width="page.frame.right - page.frame.left"
              :height="page.frame.bottom - page.frame.top"
              fill="none" stroke="#1a1208" stroke-width="3.02" />
        <!-- 内栏四缘对称内缩 5px（height 须 -10：底边不得与外栏底线重合致角部加粗） -->
        <rect :x="page.frame.left + 5" :y="page.frame.top + 5"
              :width="page.frame.right - page.frame.left - 10"
              :height="page.frame.bottom - page.frame.top - 10"
              fill="none" stroke="#1a1208" stroke-width="1.51" />

        <!-- ===== 固定界格（乌丝栏）：每半叶十格等宽；竖界行上下抵内栏线（+5/-5），不探入内外栏间隙；
             与版框外缘重合的两格点已在引擎剔除，最外界由内栏竖线充任；留白格亦有界格；
             版心两界（中缝左右边线）不入此组，另以黑线绘制 ===== -->
        <g class="ftc-book-columns" stroke="#1a1208" stroke-width="1.51" opacity="0.28">
          <line v-for="(x, i) in page.columnLines.filter(x => Math.abs(x - page.spine.left) > 0.5 && Math.abs(x - page.spine.right) > 0.5)" :key="i"
                :x1="x" :x2="x" :y1="page.frame.top + 5" :y2="page.frame.bottom - 5" />
        </g>

        <!-- 版心两界：中缝左右边线，黑口实线（不随乌丝栏淡化） -->
        <g class="ftc-book-spine-edges" stroke="#1a1208" stroke-width="1.51">
          <line :x1="page.spine.left" :x2="page.spine.left"
                :y1="page.frame.top + 5" :y2="page.frame.bottom - 5" />
          <line :x1="page.spine.right" :x2="page.spine.right"
                :y1="page.frame.top + 5" :y2="page.frame.bottom - 5" />
        </g>

        <!-- ===== 装订线与装订标识（筒子页展平：左右半叶各一条装订线，对折后重合于书脊） ===== -->
        <g v-if="page.spine.binding" class="ftc-book-binding">
          <template v-for="(lineX, li) in page.spine.binding.lineXs" :key="'bl' + li">
            <line
              v-if="page.spine.binding.type !== 'perfect'"
              :x1="lineX" :x2="lineX"
              :y1="0" :y2="page.height"
              stroke="#6b4a2a" stroke-width="1" stroke-dasharray="4 3" opacity="0.55" />
            <g v-if="page.spine.binding.type === 'staple' && page.spine.binding.stapleY" fill="#2a1a08">
              <circle v-for="(y, i) in page.spine.binding.stapleY" :key="'st' + li + i"
                      :cx="lineX" :cy="y" r="2.5" />
              <line v-for="(y, i) in page.spine.binding.stapleY" :key="'sw' + li + i"
                    :x1="lineX - 6" :x2="lineX + 6"
                    :y1="y" :y2="y" stroke="#2a1a08" stroke-width="1.2" />
            </g>
            <g v-if="page.spine.binding.type === 'sewing' && page.spine.binding.sewingY"
               fill="#fffdf7" stroke="#2a1a08" stroke-width="0.8">
              <rect v-for="(y, i) in page.spine.binding.sewingY" :key="'sh' + li + i"
                    :x="lineX - 2" :y="y - 1.5"
                    width="4" height="3" />
            </g>
          </template>
        </g>

        <!-- ===== 横格线：每人物格分三行（上格顶/底、中格底），全页 y 拉齐，按人物格宽画段线（留白格无横线）；
             左右端点收到内栏缘（+5/-5），贴版框外缘的格不向内外栏间隙出头 ===== -->
        <g class="ftc-book-rows" stroke="#1a1208" stroke-width="1.51" opacity="0.28">
          <template v-for="(p, pi) in page.people" :key="'rows-' + pi + '-' + p.id">
            <line v-for="(y, i) in page.rowLines" :key="i"
                  :x1="Math.max(p.x, page.frame.left + 5)"
                  :x2="Math.min(p.x + p.width, page.frame.right - 5)"
                  :y1="y" :y2="y" />
          </template>
        </g>

        <!-- ===== 版心（书口） ===== -->
        <g class="ftc-book-spine">
          <!-- 象鼻：版心中线（小黑口，细线贯穿上下） -->
          <line :x1="page.spine.centerX" :x2="page.spine.centerX"
                :y1="page.frame.top" :y2="page.frame.bottom"
                stroke="#1a1208" stroke-width="0" />

          <!-- 书名（上鱼尾上方竖排）：思源宋体 SemiBold 600、二号，整块在「内栏顶～上鱼尾」容器内上下居中 -->
          <text v-if="title" text-anchor="middle"
                :style="{ fontSize: titleFontSize + 'px', fill: '#1a1208', fontWeight: 600, fontFamily: TITLE_FONT }">
            <tspan v-for="(ch, i) in titleChars" :key="i"
                   :x="page.spine.centerX"
                   :y="titleCharY(page, i)" dominant-baseline="central">{{ ch }}</tspan>
          </text>

          <!-- 上鱼尾（黑鱼尾：上平实心、下缘双叉内凹；多边形取自 yuwei.svg 版刻鱼尾，
               等比缩放至与中缝等宽（高=宽×31.18/45.35≈0.6876），几何中心对齐 upperTailY（版心纵向 1/4）；
               纸色底块左右各缩 1px 避让版心界行，遮住穿过的象鼻线，双叉内呈留白） -->
          <g :transform="`translate(${page.spine.centerX}, ${page.spine.upperTailY})`">
            <rect :x="-page.spine.width / 2 + 1" :y="-(page.spine.width * 0.6876) / 2"
                  :width="page.spine.width - 2" :height="page.spine.width * 0.6876" fill="#fffdf7" />
            <polygon points="45.35,31.18 22.68,15.59 0,31.18 0,0 45.35,0"
                     :transform="`translate(${-page.spine.width / 2}, ${-(page.spine.width * 0.6876) / 2}) scale(${page.spine.width / 45.35})`" fill="#1a1208" />
          </g>

          <!-- 下鱼尾（垂直翻转：上缘双叉、下平实心，几何中心对齐 lowerTailY（版心纵向 3/4）） -->
          <g :transform="`translate(${page.spine.centerX}, ${page.spine.lowerTailY}) scale(1, -1)`">
            <rect :x="-page.spine.width / 2 + 1" :y="-(page.spine.width * 0.6876) / 2"
                  :width="page.spine.width - 2" :height="page.spine.width * 0.6876" fill="#fffdf7" />
            <polygon points="45.35,31.18 22.68,15.59 0,31.18 0,0 45.35,0"
                     :transform="`translate(${-page.spine.width / 2}, ${-(page.spine.width * 0.6876) / 2}) scale(${page.spine.width / 45.35})`" fill="#1a1208" />
          </g>

          <!-- 叶码（下鱼尾下方） -->
          <text :x="page.spine.centerX" :y="page.spine.lowerTailY + 40"
                text-anchor="middle"
                style="font-size: 14px; fill: #1a1208;">{{ page.pageNumber }}</text>
        </g>

        <!-- ===== 书眉（仅首页：右半叶最右一格＝书眉格内竖排；书眉为章节标题，只在开头出现一次。
             后续页 hasHeader=false，该格释放为正常人物轨，不排书眉、不留空列） ===== -->
        <g v-if="runningTitle && page.hasHeader" class="ftc-book-running-title">
          <text :x="page.frame.right - halfColW / 2" :y="page.frame.top + 36"
                text-anchor="middle"
                :style="{ fontSize: '34.67px', fill: '#3a2a1a', fontFamily: RUNNING_TITLE_FONT, fontWeight: 600 }">
            <tspan v-for="(ch, i) in runningTitle.split('')" :key="i"
                   :x="page.frame.right - halfColW / 2"
                   :dy="i === 0 ? 0 : 42">{{ ch }}</tspan>
          </text>
        </g>

        <!-- ===== 人物条目（一人一格，格宽固定）：上格右缘首竖行父名+排行连写；中格姓名大字格中居中（续传格缀小字「续」）；下格传文格内多竖行竖排 ===== -->
        <g v-for="(p, pi) in page.people" :key="page.pageIndex + '-' + pi + '-' + p.id" class="ftc-book-person">
          <!-- 上格：父名在上、排行在下，竖排连写一列（始祖、续传栏留空） -->
          <text v-if="p.labelChars.length" text-anchor="middle"
                :style="{ fontSize: bioSize + 'px', fill: '#3a2a1a', fontFamily: bioFontFamily || undefined }">
            <tspan v-for="(c, i) in p.labelChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>

          <!-- 中格：姓名（大字竖排，栏格正中） -->
          <text text-anchor="middle" :style="{ fontSize: nameSize + 'px', fill: '#1a1208', fontWeight: nameFontWeight, fontFamily: nameFontFamily || undefined }">
            <tspan v-for="(c, i) in p.nameChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>

          <!-- 中格姓名下方小字标记：续传栏为「续」 -->
          <text v-if="p.contMarkChars.length" text-anchor="middle"
                :style="{ fontSize: bioSize + 'px', fill: '#3a2a1a', fontFamily: bioFontFamily || undefined }">
            <tspan v-for="(c, i) in p.contMarkChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>

          <!-- 下格：生平传文（小字竖排，含字/配/生卒等；自格顶排起，满竖行在格内向左换行，整块在格宽内左右居中，超出格容量翻页续传） -->
          <text v-if="p.bioChars.length" text-anchor="middle"
                :style="{ fontSize: bioSize + 'px', fill: '#3a2a1a', fontFamily: bioFontFamily || undefined }">
            <tspan v-for="(c, i) in p.bioChars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
        </g>

        <!-- ===== 世系标签栏（"始祖"/"第二世"……每代段开头独占一列）：
             黑底圆角牌、白字竖排居中（版刻墨牌样式）；牌宽随字号、不越格缘；
             全书墨牌高度统一（以字数最多的标签为准），牌心＝列心，短标签文字在牌内仍居中；
             列内不画横格线、两缘竖界行保留 ===== -->
        <g v-for="(g, gi) in page.genLabels" :key="'gen-' + page.pageIndex + '-' + gi" class="ftc-book-genlabel">
          <rect :x="g.chars[0].x - genBadgeW / 2"
                :y="(page.frame.top + page.frame.bottom) / 2 - genBadgeH / 2"
                :width="genBadgeW"
                :height="genBadgeH"
                :rx="genBadgeRadius" :ry="genBadgeRadius"
                fill="#1a1208" />
          <text text-anchor="middle"
                :style="{ fontSize: nameSize + 'px', fill: '#FFFFFF', fontWeight: nameFontWeight, fontFamily: nameFontFamily || undefined }">
            <tspan v-for="(c, i) in g.chars" :key="i" :x="c.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
/* width:fit-content + min-width:100% + margin auto：页面窄于视口时居中，
   宽于视口（A3 横版）时随内容撑宽，左右两侧皆可滚动访问，避免 flex 居中导致左缘不可达 */
.ftc-book {
  display: flex; flex-direction: column; gap: 24px; align-items: center;
  width: fit-content; min-width: calc(100% - 48px); margin: 0 auto;
  padding: 24px; background: #f4efe6;
}
.ftc-book-page { background: #fffdf7; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12); overflow: hidden; }
.ftc-book-svg { display: block; background: #fffdf7; }
</style>
