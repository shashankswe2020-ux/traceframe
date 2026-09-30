// Shared helpers: read a spec (file or stdin), check it, and report layout problems.
import { readFileSync } from 'node:fs';
import { lib } from './load.mjs';

/** Read `{ props: {...} }` or bare props from a path, or from stdin when path is "-" or missing. */
export function readSpec(path) {
  const text = !path || path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  const json = JSON.parse(text);
  const spec = json.props ? json : { props: json };
  const errors = validateSpec(spec);
  if (errors.length) {
    console.error('Spec problems:\n  - ' + errors.join('\n  - '));
    process.exit(1);
  }
  return spec;
}

/** Walk every `show` value; `fn` maps a `{ graph: {...} }` card to whatever the renderer wants. */
export function mapGraphs(props, fn) {
  const walk = (v) =>
    v && typeof v === 'object' && !Array.isArray(v) && v.graph && typeof v.graph === 'object' ? fn(v.graph) : v;
  for (const step of props.steps ?? [])
    for (const beat of step.flow ?? [])
      if (beat && typeof beat === 'object' && !Array.isArray(beat) && beat.show)
        for (const k of Object.keys(beat.show)) beat.show[k] = walk(beat.show[k]);
  return props;
}

/** Print layout findings to stderr. With `strict`, any finding exits 1. Returns the findings. */
export async function checkLayout(props, { strict = false, quiet = false } = {}) {
  const { lint } = await lib('lint');
  const found = lint(mapGraphs(structuredClone(props), (g) => ({ props: g })));
  if (found.length && !quiet) console.error(`Layout warnings (${found.length}):\n  - ` + found.map((f) => `[${f.rule}] ${f.message}`).join('\n  - '));
  if (found.length && strict) process.exit(1);
  return found;
}

export const KEYS = {
  spec: ['$schema', 'title', 'source', 'props'],
  props: ['layout', 'edges', 'steps', 'theme', 'speed', 'autoplay'],
  group: ['id', 'label', 'logo', 'direction', 'gap', 'align', 'children'],
  node: ['id', 'label', 'sub', 'shape', 'lines', 'width'],
  edge: ['id', 'from', 'to', 'label', 'around', 'quiet'],
  step: ['label', 'caption', 'flow', 'nodes'],
  beat: ['edges', 'say', 'show', 'light', 'ms'],
  hop: ['edge', 'back', 'data'],
  row: ['tag', 'tone', 'text', 'meta', 'mark', 'mono'],
  graph: ['nodes', 'links', 'lit'],
  theme: ['accent', 'onAccent', 'fg', 'muted', 'bg', 'surface', 'border', 'font'],
};
export const ENUMS = {
  shape: ['box', 'decision', 'store'],
  direction: ['row', 'column'],
  align: ['start', 'center', 'end'],
  around: ['above', 'below'],
  tone: ['blue', 'purple', 'green', 'orange', 'gray'],
};

/** Catch the mistakes that otherwise render as a silently broken figure. */
export function validateSpec(spec) {
  const errs = [];
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const keys = (v, kind, where) => {
    if (!obj(v)) return errs.push(`${where}: expected an object`);
    for (const k of Object.keys(v)) if (!KEYS[kind].includes(k)) errs.push(`${where}: unknown key "${k}" (allowed: ${KEYS[kind].join(', ')})`);
    for (const [k, allowed] of Object.entries(ENUMS))
      if (k in v && KEYS[kind].includes(k) && !allowed.includes(v[k])) errs.push(`${where}: ${k} "${v[k]}" is not one of ${allowed.join(', ')}`);
  };
  keys(spec, 'spec', 'spec');
  const p = spec.props;
  keys(p, 'props', 'props');
  if (!p?.layout?.children) return [...errs, 'props.layout.children is missing'];
  if (p.theme) keys(p.theme, 'theme', 'props.theme');

  const ids = new Set();
  const visit = (n, where) => {
    const group = Array.isArray(n?.children);
    keys(n, group ? 'group' : 'node', where);
    if (!group && !n?.id) errs.push(`${where}: a box needs an "id"`);
    if (n?.id) {
      if (ids.has(n.id)) errs.push(`duplicate id "${n.id}"`);
      ids.add(n.id);
    }
    if (group) n.children.forEach((c, i) => visit(c, `${where}.children[${i}]${c?.id ? ` (${c.id})` : ''}`));
  };
  visit(p.layout, 'layout');

  const edgeIds = new Set();
  (p.edges ?? []).forEach((e, i) => {
    const id = e?.id ?? `${e?.from}->${e?.to}`;
    keys(e, 'edge', `edges[${i}] (${id})`);
    for (const end of ['from', 'to']) if (!ids.has(e?.[end])) errs.push(`edge ${id}: unknown ${end} "${e?.[end]}"`);
    if (edgeIds.has(id)) errs.push(`duplicate edge id "${id}"`);
    edgeIds.add(id);
  });

  const hopId = (h) => (typeof h === 'string' ? h : h?.edge);
  (p.steps ?? []).forEach((s, si) => {
    const where = `step "${s?.label ?? si}"`;
    keys(s, 'step', where);
    for (const k of s?.nodes ?? []) if (!ids.has(k)) errs.push(`${where}: nodes has unknown box "${k}"`);
    (s?.flow ?? []).forEach((b, bi) => {
      const beat = typeof b === 'string' || Array.isArray(b) ? { edges: b } : b;
      const at = `${where} beat ${bi + 1}`;
      keys(beat, 'beat', at);
      const hops = beat?.edges == null ? [] : Array.isArray(beat.edges) ? beat.edges : [beat.edges];
      for (const h of hops) {
        if (obj(h)) keys(h, 'hop', at);
        if (!edgeIds.has(hopId(h))) errs.push(`${at}: unknown edge "${hopId(h)}"`);
      }
      for (const [k, v] of Object.entries(beat?.show ?? {})) {
        if (!ids.has(k)) errs.push(`${at}: show on unknown box "${k}"`);
        if (Array.isArray(v)) v.forEach((r, ri) => keys(r, 'row', `${at} show.${k}[${ri}]`));
        else if (obj(v)) obj(v.graph) ? keys(v.graph, 'graph', `${at} show.${k}.graph`) : errs.push(`${at}: show.${k} must be rows, a string, or { graph }`);
      }
      for (const k of beat?.light ?? []) if (!ids.has(k)) errs.push(`${at}: light on unknown box "${k}"`);
    });
  });
  return errs;
}
