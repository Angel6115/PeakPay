import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: false,
    watch: { usePolling: true, interval: 200 }, // evita fsevents
  },
  plugins: [
    {
      name: 'extra-watch',
      configureServer(server) {
        const extraGlobs = [
          '../newsletter/**/*',
          '../referidos/**/*',
          '../assets/**/*',
          '../../docs/**/*',
        ];
        // agrega rutas extra al watcher de Vite
        server.watcher.add(extraGlobs);
        server.watcher.on('change', () => {
          server.ws.send({ type: 'full-reload' });
        });
      },
    },
  ],
});
