#!/usr/bin/env node
/**
 * Spec → one self-contained interactive HTML page: step tabs, pause, 1×/2× speed, hover to light
 * edges, full-screen button, light + dark theme. React and the player are bundled inline, so the
 * page makes no network requests and works as a file, an artifact, or an <iframe>.
 *
 *   node scripts/html.mjs spec.json out.html [--title "Page title"] [--accent "#6d28d9"]
 *   node scripts/html.mjs - out.html < spec.json
 *   node scripts/html.mjs --spec out.html            # print the spec a page carries
 *
 * First run installs react, react-dom and esbuild into ~/.cache/traceframe (about 10 s).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSpec } from './spec.mjs';

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [, val] = args.splice(i, 2);
  return val;
};

if (args[0] === '--spec') {
  const html = readFileSync(args[1], 'utf8');
  const m = html.match(/<script type="application\/json" id="figure-spec">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${args[1]}: no figure spec inside this page`);
  console.log(m[1].replaceAll('\\u003c', '<'));
  process.exit(0);
}

const title = flag('--title');
const accent = flag('--accent');
const [input, out = 'figure.html'] = args;
const spec = readSpec(input);

// Build tools live in a cache, not in the skill folder (which may be read-only).
const CACHE = process.env.TRACEFRAME_CACHE ?? process.env.FLOW_FIGURE_CACHE ?? join(homedir(), '.cache', 'traceframe');
if (!existsSync(join(CACHE, 'node_modules', 'esbuild')) || !existsSync(join(CACHE, 'node_modules', 'react-dom'))) {
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(join(CACHE, 'package.json'))) writeFileSync(join(CACHE, 'package.json'), '{"private":true}');
  console.error(`Installing react, react-dom, esbuild into ${CACHE} (first run only)…`);
  execSync('npm install --no-audit --no-fund --silent react@19 react-dom@19 esbuild@0.25', { cwd: CACHE, stdio: 'inherit' });
}
const esbuild = createRequire(join(CACHE, 'package.json'))('esbuild');

const entry = `
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { Flow, MiniGraph } from ${JSON.stringify(join(SKILL, 'interfig/src/index.tsx'))};
const { props } = JSON.parse(document.getElementById('figure-spec').textContent);
for (const step of props.steps ?? []) for (const beat of step.flow ?? [])
  if (beat && typeof beat === 'object' && !Array.isArray(beat) && beat.show)
    for (const k of Object.keys(beat.show)) { const v = beat.show[k];
      if (v && !Array.isArray(v) && typeof v === 'object' && v.graph) beat.show[k] = h(MiniGraph, v.graph); }
createRoot(document.getElementById('figure')).render(h(Flow, props));
`;

const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: SKILL, loader: 'js' },
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
  nodePaths: [join(CACHE, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  jsx: 'automatic',
  logLevel: 'error',
});
const js = built.outputFiles[0].text.replaceAll('</script', '<\\/script');
const json = JSON.stringify(spec).replaceAll('<', '\\u003c');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pageTitle = title ?? spec.title ?? 'Figure';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<style>
:root {
  --fig-accent: ${accent ?? '#0074d9'};
  --fig-fg: #111418; --fig-muted: #4b5563; --fig-bg: #ffffff; --fig-surface: #f5f7fa; --fig-border: #b6c0cc;
  --fig-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    ${accent ? '' : '--fig-accent: #4ea1ff;'}
    --fig-fg: #e3e3e3; --fig-muted: #9aa0a6; --fig-bg: #1b1b1d; --fig-surface: #242526; --fig-border: #3a3b3c;
  }
}
:root[data-theme="dark"] {
  ${accent ? '' : '--fig-accent: #4ea1ff;'}
  --fig-fg: #e3e3e3; --fig-muted: #9aa0a6; --fig-bg: #1b1b1d; --fig-surface: #242526; --fig-border: #3a3b3c;
}
html, body { margin: 0; background: var(--fig-bg); color: var(--fig-fg); font-family: var(--fig-font); }
main { max-width: 1400px; margin: 0 auto; padding: 24px 16px; box-sizing: border-box; }
</style>
</head>
<body>
<main><div id="figure"></div></main>
<script type="application/json" id="figure-spec">${json}</script>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(out, html);
console.log(`${out} — ${(html.length / 1024).toFixed(1)} kB`);
