import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { route } from '../interfig/src/geometry.ts';
import { lint } from '../interfig/src/lint.ts';
import { textW, toSvg } from '../interfig/src/svg.ts';
import { THEMES } from '../interfig/src/themes.ts';
import { ENUMS, KEYS, validateSpec } from '../scripts/spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const gallery = readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.json'));
const node = (...args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

const row = (ids, extra = {}) => ({ layout: { gap: 60, children: ids.map((id) => ({ id, label: id })) }, edges: [], ...extra });

test('route: stacked boxes connect bottom to top, side by side connect right to left', () => {
  const rects = { a: { x: 0, y: 0, w: 100, h: 40 }, b: { x: 0, y: 100, w: 100, h: 40 }, c: { x: 200, y: 0, w: 100, h: 40 } };
  const [down, side] = route(
    [
      { id: 'down', from: 'a', to: 'b' },
      { id: 'side', from: 'a', to: 'c' },
    ],
    rects,
  );
  assert.match(down.d, /^M 50 40 C/);
  assert.match(down.d, /, 50 100$/);
  assert.match(side.d, /^M 100 20 C/);
  assert.match(side.d, /, 200 20$/);
});

test('route: edges leaving one side are spread apart', () => {
  const rects = { a: { x: 0, y: 0, w: 100, h: 90 }, b: { x: 200, y: 0, w: 100, h: 40 }, c: { x: 200, y: 60, w: 100, h: 40 } };
  const [ab, ac] = route(
    [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'ac', from: 'a', to: 'c' },
    ],
    rects,
  );
  assert.notEqual(ab.d.split(' C')[0], ac.d.split(' C')[0]);
});

test('textW: measures glyphs, not characters', () => {
  assert.ok(textW('iiii', 12) < textW('MMMM', 12) / 2);
  assert.equal(textW('abcd', 10, { mono: true }), 24);
  assert.ok(textW('数据', 12) > textW('ab', 12));
});

test('validateSpec: every example is valid', () => {
  for (const f of [...gallery.map((f) => `examples/${f}`), 'examples/starter.json'])
    assert.deepEqual(validateSpec(read(f)), [], f);
});

test('validateSpec: catches typos, bad enums and unknown ids', () => {
  const errs = validateSpec({
    props: {
      layout: { children: [{ id: 'a', label: 'A', shape: 'cylinder' }, { label: 'no id' }] },
      edges: [{ from: 'a', to: 'zz' }],
      steps: [{ label: 's', flow: [{ edges: 'nope', sho: {} }, { show: { a: [{ text: 'x', tone: 'red' }] } }] }],
    },
  }).join('\n');
  assert.match(errs, /shape "cylinder"/);
  assert.match(errs, /a box needs an "id"/);
  assert.match(errs, /unknown to "zz"/);
  assert.match(errs, /unknown edge "nope"/);
  assert.match(errs, /unknown key "sho"/);
  assert.match(errs, /tone "red"/);
});

test('schema.json allows exactly the keys and values the validator allows', () => {
  const schema = read('schema.json');
  const props = (def) => Object.keys(schema.$defs[def].properties).sort();
  assert.deepEqual(Object.keys(schema.properties).sort(), [...KEYS.spec].sort());
  for (const kind of ['props', 'group', 'node', 'edge', 'step', 'beat', 'row', 'theme']) assert.deepEqual(props(kind), [...KEYS[kind]].sort(), kind);
  assert.deepEqual(schema.$defs.node.properties.shape.enum, ENUMS.shape);
  assert.deepEqual(schema.$defs.row.properties.tone.enum, ENUMS.tone);
});

test('lint: flags an edge that jumps over a box', () => {
  const found = lint(row(['a', 'b', 'c'], { edges: [{ id: 'skip', from: 'a', to: 'c' }] }));
  assert.ok(found.some((f) => f.rule === 'crosses-box' && /"b"/.test(f.message)));
});

test('lint: flags a crowded box side', () => {
  const kids = ['k1', 'k2', 'k3', 'k4', 'k5'];
  const fig = {
    layout: { gap: 120, children: [{ id: 'hub', label: 'hub' }, { direction: 'column', gap: 30, children: kids.map((id) => ({ id, label: id })) }] },
    edges: kids.map((k) => ({ id: k, from: 'hub', to: k })),
  };
  assert.ok(lint(fig).some((f) => f.rule === 'crowded-side'));
});

test('lint: the gallery is clean', () => {
  for (const f of gallery) assert.deepEqual(lint(read(`examples/${f}`).props), [], f);
});

test('svg: accessible, honours reduced motion, and follows the theme', () => {
  const spec = read('examples/starter.json');
  const svg = toSvg(spec.props, { title: spec.title, preset: 'github' });
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title id="fig-title">Cached API request<\/title>/);
  assert.match(svg, /<desc id="fig-desc">[^<]*Postgres/);
  assert.match(svg, /prefers-reduced-motion: reduce\) \{ \.pk/);
  assert.match(svg, /--accent:#0969da/);
  assert.match(svg, /--accent:#4493f8/);
});

test('themes: every theme defines the same colors in light and dark', () => {
  const keys = Object.keys(THEMES.default.light).sort();
  for (const [name, t] of Object.entries(THEMES)) {
    assert.deepEqual(Object.keys(t.light).sort(), keys, name);
    assert.deepEqual(Object.keys(t.dark).sort(), keys, name);
  }
});

test('svg.mjs: the SVG carries its spec', () => {
  const out = join(tmpdir(), `tf-${process.pid}.svg`);
  node('scripts/svg.mjs', 'examples/starter.json', out);
  const back = JSON.parse(node('scripts/svg.mjs', '--spec', out));
  assert.deepEqual(back.props, read('examples/starter.json').props);
});

test('from-mermaid: a sequence diagram with alt becomes one step per branch', () => {
  const spec = JSON.parse(node('scripts/from-mermaid.mjs', 'test/fixtures/cache.mmd'));
  assert.equal(spec.title, 'Cached profile lookup');
  assert.deepEqual(
    spec.props.steps.map((s) => s.label),
    ['cache hit', 'cache miss'],
  );
  assert.ok(spec.props.layout.children.some((c) => c.label === 'Backend'));
  const hops = spec.props.steps[1].flow.flatMap((b) => [b.edges ?? []].flat());
  assert.ok(hops.some((h) => h.back), 'dashed replies replay the call edge');
  assert.deepEqual(validateSpec(spec), []);
  assert.deepEqual(lint(spec.props), []);
});

test('from-mermaid: a flowchart keeps shapes and forks at the first decision', () => {
  const spec = JSON.parse(node('scripts/from-mermaid.mjs', 'test/fixtures/deploy.mmd'));
  const all = JSON.stringify(spec.props.layout);
  assert.match(all, /"id":"reg","label":"Registry","shape":"store"/);
  assert.match(all, /"shape":"decision"/);
  assert.match(all, /"label":"Deploy"/);
  assert.deepEqual(
    spec.props.steps.map((s) => s.label),
    ['yes', 'no'],
  );
  assert.deepEqual(validateSpec(spec), []);
  assert.deepEqual(lint(spec.props), []);
});

test('from-otel: services, stores and one step per trace, with errors shown', () => {
  const spec = JSON.parse(node('scripts/from-otel.mjs', 'test/fixtures/checkout-trace.otlp.json'));
  const text = JSON.stringify(spec);
  assert.equal(spec.props.steps.length, 2);
  assert.match(spec.props.steps[0].label, /GET \/checkout · 420 ms/);
  for (const store of ['redis', 'payments', 'orders']) assert.match(text, new RegExp(`"label":"${store}"[^}]*"shape":"store"`));
  assert.match(text, /api\.stripe\.com/);
  assert.match(JSON.stringify(spec.props.steps[1]), /"tag":"error"/);
  assert.deepEqual(validateSpec(spec), []);
  assert.deepEqual(lint(spec.props), []);
});
