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
            name: 'rata',
            // the proper extensions will be added
            fileName: 'rata',
        },
        sourcemap: 'inline',
        rollupOptions: {

        },
    },
    plugins: [dts({
        tsconfigPath: resolve(__dirname, 'tsconfig.production.json'),
        rollupTypes: true
    })]
})
