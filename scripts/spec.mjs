// Shared helpers: read a spec (file or stdin) and normalise it.
import { readFileSync } from 'node:fs';

/** Read `{ props: {...} }` or bare props from a path, or from stdin when path is "-" or missing. */
export function readSpec(path) {
  const text = !path || path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  const json = JSON.parse(text);
  const spec = json.props ? json : { props: json };
  const errors = validate(spec.props);
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

/** Catch the mistakes that otherwise render as a silently broken figure. */
function validate(p) {
  const errs = [];
  if (!p?.layout?.children) return ['props.layout.children is missing'];
  const ids = new Set();
  const visit = (n) => {
    if (n.id) {
      if (ids.has(n.id)) errs.push(`duplicate id "${n.id}"`);
      ids.add(n.id);
    }
    (n.children ?? []).forEach(visit);
  };
  visit(p.layout);
  const edgeIds = new Set();
  for (const e of p.edges ?? []) {
    for (const end of ['from', 'to']) if (!ids.has(e[end])) errs.push(`edge ${e.id ?? e.from + '->' + e.to}: unknown ${end} "${e[end]}"`);
    edgeIds.add(e.id ?? `${e.from}->${e.to}`);
  }
  const hopId = (h) => (typeof h === 'string' ? h : h?.edge);
  for (const s of p.steps ?? []) {
    for (const b of s.flow ?? []) {
      const beat = typeof b === 'string' || Array.isArray(b) ? { edges: b } : b;
      const hops = beat.edges == null ? [] : Array.isArray(beat.edges) ? beat.edges : [beat.edges];
      for (const h of hops) if (!edgeIds.has(hopId(h))) errs.push(`step "${s.label}": unknown edge "${hopId(h)}"`);
      for (const k of Object.keys(beat.show ?? {})) if (!ids.has(k)) errs.push(`step "${s.label}": show on unknown box "${k}"`);
      for (const k of beat.light ?? []) if (!ids.has(k)) errs.push(`step "${s.label}": light on unknown box "${k}"`);
    }
  }
  return errs;
}
