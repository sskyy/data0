import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
export default defineConfig({
    define: {
        __DEV__: false
    },
    build: {
        lib: {
            // Could also be a dictionary or array of multiple entry points
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'data0',
            // the proper extensions will be added
            fileName: 'data0',
        },
        sourcemap: true,
    },
    plugins: [dts({
        tsconfigPath: resolve(__dirname, 'tsconfig.production.json'),
        rollupTypes: true
    })]

})
