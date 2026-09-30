#!/usr/bin/env node
/**
 * Spec → one self-contained animated SVG (no scripts, no fonts, follows light/dark).
 *
 *   node scripts/svg.mjs spec.json out.svg [--theme github] [--accent "#6d28d9"] [--strict]
 *   node scripts/svg.mjs - out.svg < spec.json      # spec on stdin
 *   node scripts/svg.mjs --spec out.svg             # print the spec an SVG carries
 *
 * Layout problems (arrows through boxes, overlapping labels) are printed as warnings;
 * --strict turns them into a failure. Plain Node 22.18+, no npm install needed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { lib } from './load.mjs';
import { checkLayout, mapGraphs, readSpec } from './spec.mjs';

const OPEN = '<metadata id="figure-spec"><![CDATA[';
const CLOSE = ']]></metadata>';
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    spec: { type: 'boolean' },
    theme: { type: 'string' },
    accent: { type: 'string' },
    title: { type: 'string' },
    strict: { type: 'boolean' },
  },
});

if (opt.spec) {
  const svg = readFileSync(positionals[0], 'utf8');
  const at = svg.indexOf(OPEN);
  if (at === -1) throw new Error(`${positionals[0]}: no figure spec inside this SVG`);
  console.log(svg.slice(at + OPEN.length, svg.indexOf(CLOSE, at)));
  process.exit(0);
}

const { toSvg } = await lib('svg');
const [input, out = 'figure.svg'] = positionals;
const spec = readSpec(input);
const { props } = spec;
await checkLayout(props, { strict: opt.strict });
const original = JSON.stringify({ title: spec.title, props }); // keep the JSON form (with `graph` cards) for --spec
// The SVG renderer reads a MiniGraph's links as text: "Alice → Google".
const svg = toSvg(mapGraphs(structuredClone(props), (g) => ({ props: g })), {
  preset: opt.theme,
  theme: opt.accent ? { accent: opt.accent } : undefined,
  title: opt.title ?? spec.title,
});
const withSpec = svg.replace(/(<svg[^>]*>\n?)/, `$1${OPEN}${original.replaceAll(']]>', ']]\\u003e')}${CLOSE}\n`);
writeFileSync(out, withSpec);
console.log(`${out} — ${(withSpec.length / 1024).toFixed(1)} kB`);
