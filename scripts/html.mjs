#!/usr/bin/env node
/**
 * Spec → one self-contained interactive HTML page: step tabs, pause, 1×/2× speed, a beat timeline,
 * keyboard control (← → space), #step=N links, hover to light edges, full screen, light + dark theme.
 * Preact and the player are bundled inline, so the page makes no network requests and works as a
 * file, an artifact, or an <iframe>.
 *
 *   node scripts/html.mjs spec.json out.html [--title "Page title"] [--theme github] [--accent "#6d28d9"] [--strict]
 *   node scripts/html.mjs - out.html < spec.json
 *   node scripts/html.mjs --spec out.html            # print the spec a page carries
 *
 * First run installs the pinned versions in scripts/runtime (esbuild, preact) into
 * ~/.cache/traceframe with `npm ci --ignore-scripts`, which checks every package's integrity hash.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { lib } from './load.mjs';
import { checkLayout, readSpec } from './spec.mjs';

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const { values: opt, positionals: args } = parseArgs({
  allowPositionals: true,
  options: {
    spec: { type: 'boolean' },
    title: { type: 'string' },
    theme: { type: 'string' },
    accent: { type: 'string' },
    strict: { type: 'boolean' },
  },
});

if (opt.spec) {
  const html = readFileSync(args[0], 'utf8');
  const m = html.match(/<script type="application\/json" id="figure-spec">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${args[0]}: no figure spec inside this page`);
  console.log(m[1].replaceAll('\\u003c', '<'));
  process.exit(0);
}

const [input, out = 'figure.html'] = args;
const spec = readSpec(input);
await checkLayout(spec.props, { strict: opt.strict });
const { palettes } = await lib('themes');
const { light, dark } = palettes(opt.theme, opt.accent ? { accent: opt.accent } : {});

// Build tools live in a cache, not in the skill folder (which may be read-only).
const CACHE = process.env.TRACEFRAME_CACHE ?? process.env.FLOW_FIGURE_CACHE ?? join(homedir(), '.cache', 'traceframe');
const RUNTIME = join(SKILL, 'scripts', 'runtime');
const lock = readFileSync(join(RUNTIME, 'package-lock.json'), 'utf8');
const stamp = join(CACHE, 'installed-lock.json');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== lock) {
  mkdirSync(CACHE, { recursive: true });
  copyFileSync(join(RUNTIME, 'package.json'), join(CACHE, 'package.json'));
  writeFileSync(join(CACHE, 'package-lock.json'), lock);
  console.error(`Installing pinned esbuild + preact into ${CACHE} (first run only)…`);
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], {
    cwd: CACHE,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  writeFileSync(stamp, lock);
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
createRoot(document.getElementById('figure')).render(h(Flow, { ...props, deepLink: true }));
`;

const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: SKILL, loader: 'js' },
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
  nodePaths: [join(CACHE, 'node_modules')],
  // The player is written against the React API; Preact's compat layer runs it at a fraction of the size.
  alias: {
    react: 'preact/compat',
    'react-dom': 'preact/compat',
    'react-dom/client': 'preact/compat/client',
    'react/jsx-runtime': 'preact/jsx-runtime',
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  jsx: 'automatic',
  logLevel: 'error',
});
const js = built.outputFiles[0].text.replaceAll('</script', '<\\/script');
const json = JSON.stringify(spec).replaceAll('<', '\\u003c');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pageTitle = opt.title ?? spec.title ?? 'Figure';
const vars = (p) =>
  `--fig-accent: ${p.accent}; --fig-onAccent: ${p.onAccent}; --fig-fg: ${p.fg}; --fig-muted: ${p.muted}; --fig-bg: ${p.bg}; --fig-surface: ${p.surface}; --fig-border: ${p.border};`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<style>
:root {
  ${vars(light)}
  --fig-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { ${vars(dark)} }
}
:root[data-theme="dark"] { ${vars(dark)} }
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
