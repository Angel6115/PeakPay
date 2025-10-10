// phase0/landing/vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: false,
    watch: { usePolling: true, interval: 200 } // estable en macOS
  },
  plugins: [
    {
      name: 'extra-watch',
      configureServer(server) {
        // Vigila TODO lo que esté debajo de phase0 y docs
        const extraGlobs = [
          '../**/*',        // todo phase0 (newsletter, referidos, assets, etc.)
          '../../docs/**/*' // docs en la raíz del repo
        ];
        server.watcher.add(extraGlobs);

        // Recarga completa cuando se crean/eliminan archivos o carpetas
        const reload = () => server.ws.send({ type: 'full-reload' });
        server.watcher.on('add', reload);
        server.watcher.on('addDir', reload);
        server.watcher.on('unlink', reload);
        server.watcher.on('unlinkDir', reload);
        server.watcher.on('change', reload);
      }
    }
  ]
});
