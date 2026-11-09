// 包入口
import type { App, Plugin } from 'vue'
import FamilyTreeChart from './components/FamilyTreeChart.vue'
import FamilyTreeBook from './components/FamilyTreeBook.vue'

export { FamilyTreeChart, FamilyTreeBook }
export { runLayout } from './core/layout'
export { runBookLayout } from './core/bookLayout'
export { validateFamily, countNodes } from './core/validate'
export type * from './core/types'

const plugin: Plugin = {
  install(app: App) {
    app.component('FamilyTreeChart', FamilyTreeChart)
    app.component('FamilyTreeBook', FamilyTreeBook)
  }
}
export default plugin