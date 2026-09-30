// Node strips TypeScript types itself, except under node_modules (npx, npm i). There we strip them here.
import { readFileSync } from 'node:fs';
import module from 'node:module';
import { fileURLToPath } from 'node:url';

if (import.meta.url.includes('/node_modules/')) {
  const warn = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes('stripTypeScriptTypes') ? undefined : warn.call(process, w, ...rest));
  module.registerHooks({
    load(url, context, next) {
      if (!url.startsWith('file:') || !url.endsWith('.ts')) return next(url, context);
      const source = module.stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'));
      return { format: 'module', source, shortCircuit: true };
    },
  });
}

/** Import one of the renderer modules in interfig/src. */
export const lib = (name) => import(new URL(`../interfig/src/${name}.ts`, import.meta.url).href);
