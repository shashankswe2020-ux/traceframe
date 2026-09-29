#!/usr/bin/env node
/**
 * Spec → one self-contained animated SVG (no scripts, no fonts, follows light/dark).
 *
 *   node scripts/svg.mjs spec.json out.svg
 *   node scripts/svg.mjs - out.svg < spec.json      # spec on stdin
 *   node scripts/svg.mjs --spec out.svg             # print the spec an SVG carries
 *
 * Plain Node 22.18+ (it strips TypeScript types itself). No npm install needed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { toSvg } from '../interfig/src/svg.ts';
import { mapGraphs, readSpec } from './spec.mjs';

const OPEN = '<metadata id="figure-spec"><![CDATA[';
const CLOSE = ']]></metadata>';
const args = process.argv.slice(2);

if (args[0] === '--spec') {
  const svg = readFileSync(args[1], 'utf8');
  const at = svg.indexOf(OPEN);
  if (at === -1) throw new Error(`${args[1]}: no figure spec inside this SVG`);
  console.log(svg.slice(at + OPEN.length, svg.indexOf(CLOSE, at)));
  process.exit(0);
}

const [input, out = 'figure.svg'] = args;
const { props } = readSpec(input);
const original = JSON.stringify({ props }); // keep the JSON form (with `graph` cards) for --spec
// The SVG renderer reads a MiniGraph's links as text: "Alice → Google".
const svg = toSvg(mapGraphs(structuredClone(props), (g) => ({ props: g })));
const withSpec = svg.replace(/(<svg[^>]*>\n?)/, `$1${OPEN}${original.replaceAll(']]>', ']]\\u003e')}${CLOSE}\n`);
writeFileSync(out, withSpec);
console.log(`${out} — ${(withSpec.length / 1024).toFixed(1)} kB`);
