<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { FamilyTreeChart, FamilyTreeBook } from '../src'
import type { FamilyNode, Direction, TextStyle, SpouseFormat } from '../src/core/types'

// 演示数据生成器（简化版，方便本地验证）
// 使用固定种子的伪随机数：保证每次刷新生成同一棵树，
// 避免因树宽不同导致 focusRoot 的 width/20 缩放比例不稳定、文字忽大忽小
const SURNAMES = '李王张刘陈杨赵黄'.split('')
const GIVEN = '世明文章志德永长兴启'.split('')
// 线性同余伪随机数（固定种子），替代 Math.random 使刷新后数据一致
let seed = 20260909
function rnd(): number {
  seed = (1103515245 * seed + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rnd() * arr.length)] }
function genFamily(target: number): FamilyNode {
  let counter = 0
  function mk(): FamilyNode {
    counter += 1
    const gender = rnd() < 0.5 ? 'm' : 'f'
    return {
      id: 'p' + counter,
      name: pick(SURNAMES) + pick(GIVEN),
      gender,
      spouse: rnd() < 0.35 ? (gender === 'm' ? ['刘氏', '张氏'] : ['赵氏']) : undefined,
      inherit: rnd() < 0.15 ? (['承继', '过继', '兼祧'] as const)[Math.floor(rnd() * 3)] : undefined,
      children: []
    }
  }
  const root = mk()
  const queue: FamilyNode[] = [root]
  let head = 0
  while (counter < target && head < queue.length) {
    const n = queue[head++]
    if ((n as unknown as { depth: number }).depth >= 8) continue
    const k = Math.max(1, Math.min(8, Math.round(2 + (rnd() * 2 - 1))))
    for (let i = 0; i < k && counter < target; i++) {
      const c = mk()
      ;(c as unknown as { depth: number }).depth = ((n as unknown as { depth: number }).depth || 0) + 1
      n.children!.push(c)
      queue.push(c)
    }
  }
  return root
}

// 固定演示树（便于直观验证"叶子零推有子兄弟"布局）：
// a(根) 有 3 子：b(左,有子 e)、c(中,有子 f/g/h)、d(右,无子=叶子)
function demoFixed(): FamilyNode {
  return {
    id: 'a', name: '始祖', gender: 'm', spouse: ['王芳', '李秀英'],
    children: [
      { id: 'b', name: '长子', gender: 'm', spouse: ['张晓梅'], children: [{ id: 'e', name: '二戊', gender: 'm', spouse: ['陈丽华'] }] },
      { id: 'c', name: '次子', gender: 'm', spouse: ['刘桂英'], children: [
          { id: 'f', name: '二己', gender: 'm', spouse: ['赵丽'] },
          { id: 'g', name: '二庚', gender: 'm' },
          { id: 'h', name: '二辛', gender: 'm', spouse: ['孙玉珍', '周淑华'] }] },
      { id: 'd', name: '三子', gender: 'm' }
    ]
  }
}
const data = ref<FamilyNode>(demoFixed())
const collapsed = ref<string[]>([])

// 视图模式：图谱（宝塔吊线） / 谱书（牒记式）
const viewMode = ref<'chart' | 'book'>('chart')

function buildBookTree(): FamilyNode {
  return {
    id: 'a', name: '周邦', gender: 'm', spouse: ['苏玉', '吴氏'],
    bio: '生于嘉庆丁丑年十月十四日子时，卒于咸丰庚申年十二月十四日卯时。原配苏氏、继配吴氏。公与继妣合葬于本里坐甲向庚。',
    children: [
      { id: 'b', name: '廷芬', gender: 'm', spouse: ['朱氏'],
        bio: '生于同治癸酉年二月十九日，卒于民国己未年二月初九日，享年四十有七。配朱氏。',
        children: [
          { id: 'e', name: '邦霖', gender: 'm', spouse: ['陈氏'],
            courtesyName: '子甘',
            bio: '生于光绪丙申年四月初九日，配林氏再醮。',
            children: [
              { id: 'i', name: '景陶', gender: 'm', spouse: ['秦氏'],
                courtesyName: '叙庵',
                bio: '生于民国壬子年三月十八日辰时，性敦厚，务农为业。配秦氏。卒于共和辛酉年，合葬凤坞南原。',
                children: [
                  { id: 'm', name: '维城', gender: 'm',
                    courtesyName: '定藩',
                    bio: '生于民国丁卯年七月既望，幼承庭训，嗜读经史。少与从弟维垣同塾读书，过目成诵，师甚器之。值时世更迭，遂辍学，服贾于吴兴城闉，诚信待人，乡里称善。中年归里，置田赡族，倡修宗祠，续辑宗谱。配史氏，克勤克俭，内政修明。晚岁手录祖训一卷，以贻子孙。卒于丁酉年冬，享年九十有一，葬祖茔之侧。',
                    children: [
                      { id: 'x', name: '承宗', gender: 'm', bio: '生于共和辛酉年。' },
                      { id: 'y', name: '承业', gender: 'm', bio: '生于共和甲子年。' }
                    ] },
                  { id: 'n', name: '维垣', gender: 'm', spouse: ['何氏'],
                    bio: '生于民国甲申年五月，勤朴守业，事亲至孝。配何氏。' }
                ] },
              { id: 'j', name: '景伊', gender: 'm', spouse: ['丁氏'],
                courtesyName: '聘三',
                bio: '生于民国戊午年八月，少随兄耕读，后赴沪上习商。配丁氏。',
                children: [
                  { id: 'u', name: '维宁', gender: 'm',
                    bio: '生于民国丁卯年七月既望，幼承庭训，嗜读经史。少与从弟维垣同塾读书，过目成诵，师甚器之。值时世更迭，遂辍学，服贾于吴兴城闉，诚信待人，乡里称善。中年归里，置田赡族，倡修宗祠，续辑宗谱。晚岁手录祖训一卷，以贻子孙。卒于丁酉年冬，享年九十有一，葬祖茔之侧。' },
                  { id: 'v', name: '维远', gender: 'm',
                    bio: '生于共和癸巳年，性情旷达，好游山水。' }
                ] }
            ] }
        ] },
      { id: 'c', name: '廷苏', gender: 'm', spouse: ['林氏'],
        bio: '生于同治甲戌年十二月廿七日酉时，卒于光绪乙未年五月廿一日卯时。配林氏。葬在吴兴凤坞南山坐巳向亥。',
        children: [
          { id: 'f', name: '邦彦', gender: 'm', spouse: ['严氏'],
            courtesyName: '子良',
            bio: '生于光绪庚子年九月初三日酉时，卒于民国辛巳年四月十九日。配武康县乌牛桥王柳庭公长女严氏。',
            children: [
              { id: 'k', name: '景明', gender: 'm', spouse: ['沈氏'],
                courtesyName: '允昭',
                bio: '生于民国己未年二月十二日，自幼颖悟，毕业于吴兴中学。时值抗战军兴，投笔从戎，转辗湘桂，胜利后归里任教。配沈氏。享年六十有八。',
                children: [
                  { id: 'o', name: '维清', gender: 'm', bio: '生于共和丙申年，力学，入太学。' },
                  { id: 'p', name: '维濂', gender: 'm', bio: '生于共和己亥年，精算学，服贾。' },
                  { id: 'q', name: '维洛', gender: 'm', bio: '早慧，十岁能文，惜未冠而卒。' }
                ] },
              { id: 'l', name: '景哲', gender: 'm',
                courtesyName: '浚周',
                bio: '生于民国壬戌年，早岁赴沪业棉布，诚信起家。' }
            ] },
          { id: 'g', name: '邦彦', gender: 'm',
            courtesyName: '子辰',
            bio: '生于光绪乙巳年正月十二日寅时。',
            children: [
              { id: 'r', name: '景周', gender: 'm', bio: '早卒。' }
            ] },
          { id: 'h', name: '邦杰', gender: 'm', spouse: ['黄氏', '邱氏'],
            courtesyName: '子美',
            bio: '生于宣统己酉年九月初九日午时。原配平邑南田黄氏，继配邱氏。',
            children: [
              { id: 's', name: '景文', gender: 'm',
                courtesyName: '郁哉',
                bio: '生于民国己卯年十月，嗜书画，善兰竹。' },
              { id: 't', name: '景武', gender: 'm', spouse: ['高氏'],
                bio: '生于民国壬午年，身量魁伟，膂力过人，务农起家。配高氏。',
                children: [
                  { id: 'w', name: '承祖', gender: 'm', bio: '生于共和戊辰年。' }
                ] }
            ] }
        ] },
      { id: 'd', name: '廷福', gender: 'm',
        bio: '出嗣。' }
    ]
  }
}
const bookData = ref<FamilyNode>(buildBookTree())

// ===== 控制项状态（与原 HTML 一致），全部透传给组件 =====
const direction = ref<Direction>('ltr')
const showRank = ref(true)
const showInherit = ref(true)
const enableFold = ref(true)
const hoverHighlight = ref(true)
const spouseFormat = ref<SpouseFormat>('full')
const gapX = ref(100)
const gapY = ref(96)
const spGap = ref(7)
const mainStyle = reactive<Partial<TextStyle>>({ size: 12, color: '#4A3222' })
const auxStyle = reactive<Partial<TextStyle>>({ size: 10, color: '#9A7D5C' })

// 谱书控制项（对应 FamilyTreeBook 的 nameSize / bioSize props）
// 字号→px 换算基准：1pt = 96/72 ≈ 1.333px（CSS 96dpi）
const NAME_SIZES = [
  { label: '初号', pt: 42, px: 56.00 },
  { label: '小初', pt: 36, px: 48.00 },
  { label: '一号', pt: 26, px: 34.67 },
  { label: '小一', pt: 24, px: 32.00 },
  { label: '二号', pt: 22, px: 29.33 },
  { label: '小二', pt: 18, px: 24.00 },
  { label: '三号', pt: 16, px: 21.33 },
  { label: '小三', pt: 15, px: 20.00 },
  { label: '四号', pt: 14, px: 18.67 },
  { label: '小四', pt: 12, px: 16.00 }
]
const BIO_SIZES = [
  { label: '四号', pt: 14, px: 18.67 },
  { label: '小四', pt: 12, px: 16.00 },
  { label: '五号', pt: 10.5, px: 14.00 },
  { label: '小五', pt: 9, px: 12.00 },
  { label: '六号', pt: 7.5, px: 10.00 },
  { label: '小六', pt: 6.5, px: 8.67 }
]
const bookNameSize = ref(29.33) // 默认二号（最接近原 30px）
const bookBioSize = ref(18.67)     // 默认四号
// 传文行距倍数（滑块控制，默认 1.5 紧排）
const bookBioLh = ref(1.25)
// 本地系统字体族（Windows 自带/本机已装；空串 = 浏览器默认）。weight 为姓名大字所用字重
const SERIF_CN_STACK = "'Source Han Serif CN','思源宋体 CN','Noto Serif SC',serif"
const FONT_FAMILIES = [
  { label: '默认', value: '', weight: 'bold' },
  { label: '思源宋体', value: SERIF_CN_STACK, weight: 600 },
  { label: '宋体', value: 'SimSun', weight: 'bold' },
  { label: '仿宋', value: 'FangSong', weight: 'bold' },
  { label: '楷体', value: 'KaiTi', weight: 'bold' },
  { label: '黑体', value: 'SimHei', weight: 'bold' },
  { label: '微软雅黑', value: 'Microsoft YaHei', weight: 'bold' }
]
// 姓名/传文字体族（默认思源宋体：姓名大字 SemiBold 600、传文 Regular 400，本机已装 Source Han Serif CN）
const bookNameFont = ref(SERIF_CN_STACK)
const bookBioFont = ref(SERIF_CN_STACK)
// 姓名大字字重随所选字体（思源宋体用 SemiBold 600，其余保持 bold）
const bookNameWeight = computed(() =>
  FONT_FAMILIES.find(f => f.value === bookNameFont.value)?.weight ?? 'bold'
)

// 步进辅助：范围限制
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

function onLayoutReady(info: { width: number; height: number; total: number }) {
  console.log('[demo] layoutReady', info)
}

function toggleRootFold() {
  collapsed.value = collapsed.value.includes('p1')
    ? collapsed.value.filter(x => x !== 'p1')
    : [...collapsed.value, 'p1']
}
</script>

<template>
  <div class="page">
    <h2>vue-family-tree-chart 本地验证</h2>

    <div class="panel">
      <!-- 视图切换：常驻显示，不受视图模式影响 -->
      <button :class="['tg', viewMode === 'chart' && 'on']" @click="viewMode = 'chart'">图谱</button>
      <button :class="['tg', viewMode === 'book' && 'on']" @click="viewMode = 'book'">谱书</button>

      <span class="sep"></span>

      <!-- 控制按钮组：按当前视图模式二选一显示，切换带淡入过渡 -->
      <Transition name="ctl-fade" mode="out-in">
        <!-- 图谱视图专用控制组 -->
        <span class="ctl-group" v-if="viewMode === 'chart'" key="chart">
          <button @click="data = genFamily(500)">重新生成 500</button>
          <button @click="collapsed = []">全部展开</button>
          <button @click="toggleRootFold()">折叠/展开始祖</button>

          <span class="sep"></span>
          <button :class="['tg', direction === 'ltr' && 'on']" @click="direction = 'ltr'">从左到右</button>
          <button :class="['tg', direction === 'rtl' && 'on']" @click="direction = 'rtl'">从右到左</button>
          <button :class="['tg', showRank && 'on']" @click="showRank = !showRank">排行</button>
          <button :class="['tg', showInherit && 'on']" @click="showInherit = !showInherit">承继</button>
          <button :class="['tg', enableFold && 'on']" @click="enableFold = !enableFold">折叠</button>
          <button :class="['tg', hoverHighlight && 'on']" @click="hoverHighlight = !hoverHighlight">高亮</button>
          <button :class="['tg', spouseFormat === 'surname' && 'on']"
                  @click="spouseFormat = spouseFormat === 'full' ? 'surname' : 'full'"
                  :title="spouseFormat === 'full' ? '当前：完整姓名；点击切换为某氏格式' : '当前：某氏格式；点击切换为完整姓名'">
            {{ spouseFormat === 'full' ? '全名' : '某氏' }}
          </button>

          <span class="sep"></span>
          <label class="ctl">间距
            <input type="range" min="30" max="400" v-model.number="gapX">
          </label>
          <label class="ctl">层距
            <input type="range" min="70" max="180" v-model.number="gapY">
          </label>
          <label class="ctl">配偶距
            <input type="range" min="7" max="30" v-model.number="spGap">
          </label>

          <span class="sep"></span>
          <label class="ctl">主字号
            <input type="range" min="8" max="24" v-model.number="mainStyle.size" style="width:80px">
          </label>
          <label class="ctl">辅字号
            <input type="range" min="8" max="20" v-model.number="auxStyle.size" style="width:80px">
          </label>
        </span>

        <!-- 谱书视图专用控制组 -->
        <span class="ctl-group" v-else key="book">
          <label class="ctl">姓名字号
            <select v-model.number="bookNameSize">
              <option v-for="s in NAME_SIZES" :key="s.label" :value="s.px">{{ s.label }}</option>
            </select>
          </label>
          <label class="ctl">传文字号
            <select v-model.number="bookBioSize">
              <option v-for="s in BIO_SIZES" :key="s.label" :value="s.px">{{ s.label }}</option>
            </select>
          </label>
          <label class="ctl">行距
            <input type="range" min="1" max="2" step="0.05" v-model.number="bookBioLh" style="width:80px">
          </label>
          <label class="ctl">姓名字体
            <select v-model="bookNameFont">
              <option v-for="f in FONT_FAMILIES" :key="f.label" :value="f.value">{{ f.label }}</option>
            </select>
          </label>
          <label class="ctl">传文字体
            <select v-model="bookBioFont">
              <option v-for="f in FONT_FAMILIES" :key="f.label" :value="f.value">{{ f.label }}</option>
            </select>
          </label>
        </span>
      </Transition>
    </div>

    <div class="chart-wrap" v-if="viewMode === 'chart'">
      <FamilyTreeChart
        :data="data"
        v-model:collapsed="collapsed"
        v-model:direction="direction"
        :gap-x="gapX"
        :gap-y="gapY"
        :sp-gap="spGap"
        :show-rank="showRank"
        :show-inherit="showInherit"
        :enable-fold="enableFold"
        :hover-highlight="hoverHighlight"
        :spouse-format="spouseFormat"
        :main-style="mainStyle"
        :aux-style="auxStyle"
        @layout-ready="onLayoutReady"
      />
    </div>
    <div class="book-wrap" v-else>
      <FamilyTreeBook :data="bookData" title="周氏家谱" running-title="周氏世系简录"
                      :name-size="bookNameSize" :bio-size="bookBioSize"
                      :bio-line-spacing="bookBioLh"
                      :name-font-family="bookNameFont" :bio-font-family="bookBioFont"
                      :name-font-weight="bookNameWeight" />
    </div>
  </div>
</template>

<style>
html, body { margin: 0; height: 100%; font-family: sans-serif; }
#app { height: 100%; }
.page { display: flex; flex-direction: column; height: 100%; padding: 12px; box-sizing: border-box; overflow: hidden; }
.panel {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-bottom: 8px; padding: 8px 10px; border: 1px solid #E4D5C0;
  border-radius: 6px; background: #FFFDF7;
}
.panel button { padding: 5px 10px; border: 1px solid #D8B48A; border-radius: 4px; background: #FFF; cursor: pointer; }
.panel button.on { background: #9C3E28; color: #FFF4E0; border-color: #7E2F1F; }
.panel select {
  padding: 5px 10px; border: 1px solid #D8B48A; border-radius: 4px;
  background: #FFF; cursor: pointer; font-size: 12px; color: #5A4632;
  appearance: auto; /* 保留原生下拉箭头 */
}
.panel .sep { width: 1px; height: 22px; background: #E0CDB4; margin: 0 2px; }
.panel .ctl { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #5A4632; }
.panel input[type=range] { width: 110px; }
.panel .ctl-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* 控制组随视图切换的淡入淡出过渡 */
.ctl-fade-enter-active, .ctl-fade-leave-active { transition: opacity .18s ease, transform .18s ease; }
.ctl-fade-enter-from, .ctl-fade-leave-to { opacity: 0; transform: translateY(-4px); }
.chart-wrap { flex: 1; min-height: 0; }
.book-wrap { flex: 1; min-height: 0; overflow: auto; }
</style>