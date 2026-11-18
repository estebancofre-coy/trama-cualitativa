import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

function offlineBundle() {
  return {
    name: 'trama-offline-bundle',
    apply: 'build',
    async closeBundle() {
      const root = 'dist';
      async function filesIn(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
      }
      const files = (await filesIn(root)).sort();
      const version = createHash('sha256');
      for (const file of files) version.update(relative(root, file).replaceAll('\\', '/')).update(await readFile(file));
      const paths = files.map(file => relative(root, file).replaceAll('\\', '/'));
      const worker = await readFile('src/service-worker.js', 'utf8');
      await writeFile(join(root, 'sw.js'), worker.replace('__TRAMA_CACHE_VERSION__', version.digest('hex').slice(0, 16)).replace('__TRAMA_PRECACHE__', JSON.stringify(paths)));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlineBundle()],
  build: { target: 'es2022' },
});
