import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'build',
        emptyOutDir: true,
    },
    server: {
        proxy: {
            '/lib': 'http://localhost:8081',
            '/session': 'http://localhost:8081',
            '/adapter': 'http://localhost:8081',
            '/socket.io': 'http://localhost:8081',
        },
    },
});
