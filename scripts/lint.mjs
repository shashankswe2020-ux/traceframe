#!/usr/bin/env node
/**
 * Check specs without rendering: spec problems and layout warnings. Exits 1 on any finding.
 *
 *   node scripts/lint.mjs spec.json [more.json …]
 */
import { checkLayout, readSpec } from './spec.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/lint.mjs spec.json [more.json …]');
  process.exit(1);
}
let bad = 0;
for (const f of files) {
  const found = await checkLayout(readSpec(f).props, { quiet: true });
  if (!found.length) {
    console.log(`${f}: ok`);
    continue;
  }
  bad++;
  console.error(`${f}: ${found.length} layout warning${found.length > 1 ? 's' : ''}`);
  for (const x of found) console.error(`  - [${x.rule}] ${x.message}`);
}
process.exit(bad ? 1 : 0);
