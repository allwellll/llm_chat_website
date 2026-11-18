import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production APIs are exclusively served by server/local.mjs, never Vite middleware.
export default defineConfig({
  base: './',
  envPrefix: 'VITE_',
  plugins: [react()],
  server: { port: 3000, open: false, host: '127.0.0.1' },
  build: {
    target: 'esnext', sourcemap: false, minify: 'esbuild', cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: {
      'vendor-react': ['react', 'react-dom'],
      'vendor-icons': ['lucide-react'],
      'vendor-markdown': ['react-markdown', 'rehype-highlight', 'rehype-katex', 'remark-gfm', 'remark-math'],
      'vendor-katex': ['katex'], 'vendor-motion': ['framer-motion']
    } } }
  }
});
