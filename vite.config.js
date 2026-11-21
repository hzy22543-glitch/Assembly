import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'

// 加载 .env 文件
config()

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      },
      // ========== 阿里云 DashScope 代理 (当前启用) ==========
      '/dashscope': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dashscope/, '')
      },
      // ========== 硅基流动代理 (备用) ==========
      // '/siliconflow': {
      //   target: 'https://api.siliconflow.cn',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/siliconflow/, '')
      // },
      // ========== 混元代理 (已暂停，续费后取消注释) ==========
      // '/hunyuan': {
      //   target: 'https://api.hunyuan.cloud.tencent.com',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/hunyuan/, '')
      // }
    }
  },
  define: {
    // Vite 会自动从 .env* 文件注入 VITE_* 变量到 import.meta.env
    // 不需要显式定义 process.env，这些在浏览器构建时不可用
  }
})
