// 包入口
import type { App, Plugin } from 'vue'
import FamilyTreeChart from './components/FamilyTreeChart.vue'
import FamilyTreeBook from './components/FamilyTreeBook.vue'
import FamilyTreeVolume from './components/FamilyTreeVolume.vue'

export { FamilyTreeChart, FamilyTreeBook, FamilyTreeVolume }
export { runLayout } from './core/layout'
export { runBookLayout } from './core/bookLayout'
export { validateFamily, countNodes } from './core/validate'
export { assembleVolume } from './core/volume/assemble'
export type { AssembleOptions } from './core/volume/assemble'
export {
  STANDARD_CHAPTER_ORDER,
  STANDARD_TITLES,
  createChapter,
  createVolumePlan,
  insertChapter,
  removeChapter,
  moveChapter,
  setChapterEnabled,
  appendPreface
} from './core/volume/registry'
export type { PlanSeed } from './core/volume/registry'
export { sliceTree } from './core/volume/treeTiles'
export type { TreeSliceResult } from './core/volume/treeTiles'
export {
  computeVolumeGeometry,
  normalizeBinding,
  computeBindingOnSpine,
  paginateVerticalText,
  paginateToc,
  paginatePlates,
  buildCoverPage,
  tocLeafCount,
  toChineseNum,
  centerChars,
  volumeGridXs,
  HALF_COLS
} from './core/volume/paginate'
export type * from './core/types'
export type * from './core/volume/types'

const plugin: Plugin = {
  install(app: App) {
    app.component('FamilyTreeChart', FamilyTreeChart)
    app.component('FamilyTreeBook', FamilyTreeBook)
    app.component('FamilyTreeVolume', FamilyTreeVolume)
  }
}
export default plugin