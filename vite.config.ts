import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      // 生成 .d.ts 到 dist，并内联引用的 vue SFC 类型
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.json',
      copyDtsFiles: true,
      // 不需要的临时目录产物
      cleanVueFileName: true
    })
  ],
  build: {
    // 组件 CSS 统一打进单个 css（第三方组件便于一键引入）
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      name: 'FamilyTreeChart',
      // 区分 ESM（.mjs）与 UMD（.cjs），消除 CJS/ESM 歧义
      fileName: (format) => (format === 'es' ? 'index.es.mjs' : 'index.umd.cjs'),
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        exports: 'named',
        globals: { vue: 'Vue' }
      }
    }
  }
})