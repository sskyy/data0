import { defineConfig } from 'vite'
export default defineConfig({
    define: {
      __DEV__: false
    },
    server: {
        fs: {
            allow: ['../..']
        }
    }
})
