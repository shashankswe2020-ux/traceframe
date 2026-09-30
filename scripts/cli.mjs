#!/usr/bin/env node
// One entry point for `npx traceframe <command>`: each command is one of the scripts next to this file.
import { readFileSync } from 'node:fs';

const COMMANDS = {
  svg: ['svg.mjs', 'spec.json out.svg [--theme NAME] [--accent HEX] [--strict]', 'animated SVG for READMEs, PRs and docs'],
  html: ['html.mjs', 'spec.json out.html [--theme NAME] [--accent HEX] [--title T] [--strict]', 'interactive HTML player'],
  video: ['video.mjs', 'spec.json out.(mp4|gif|png) [--step N] [--at SEC] [--fps 15] [--dark]', 'MP4, GIF or PNG via headless Chrome'],
  lint: ['lint.mjs', 'spec.json [more.json …]', 'check specs for problems and crowded layouts'],
  'from-mermaid': ['from-mermaid.mjs', 'diagram.mmd [spec.json]', 'convert a Mermaid sequence diagram or flowchart'],
  'from-otel': ['from-otel.mjs', 'trace.json [spec.json]', 'convert an OpenTelemetry, Jaeger or Zipkin trace'],
};

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === '--version' || cmd === '-v') {
  console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}
if (!cmd || !COMMANDS[cmd]) {
  if (cmd && cmd !== '--help' && cmd !== '-h') console.error(`Unknown command "${cmd}".\n`);
  console.log('Traceframe: animated, step-by-step system diagrams.\n\nUsage: traceframe <command> …\n');
  for (const [name, [, args, what]] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(13)} ${args}\n  ${''.padEnd(13)} ${what}\n`);
  console.log('Themes: default, github, vercel, linear, contrast. Spec format: SKILL.md and schema.json.');
  process.exit(cmd && cmd !== '--help' && cmd !== '-h' ? 1 : 0);
}
process.argv = [process.argv[0], new URL(COMMANDS[cmd][0], import.meta.url).pathname, ...rest];
await import(new URL(COMMANDS[cmd][0], import.meta.url).href);
