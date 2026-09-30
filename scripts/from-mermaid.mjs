#!/usr/bin/env node
/**
 * Mermaid → Traceframe spec, as a starting point you then refine (cards, real data, captions).
 *
 *   node scripts/from-mermaid.mjs diagram.mmd > spec.json
 *   node scripts/from-mermaid.mjs diagram.mmd spec.json
 *   node scripts/from-mermaid.mjs README.md spec.json      # the first ```mermaid block in a file
 *
 * sequenceDiagram: participants become boxes (a `box` becomes a frame), messages become beats, a
 * dashed reply replays the call's edge backwards, `Note` becomes narration, and each branch of the
 * first `alt`/`else` becomes its own step. Other blocks (loop, opt, par…) are played inline.
 *
 * flowchart / graph: nodes keep their shapes ([( )] store, { } decision), subgraphs become frames,
 * and nodes are laid out in ranks along the flow. Each branch of the first decision becomes a step.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, out] = process.argv.slice(2);
if (!input) {
  console.error('usage: node scripts/from-mermaid.mjs diagram.mmd [spec.json]');
  process.exit(1);
}
let src = readFileSync(input === '-' ? 0 : input, 'utf8');
const fenced = src.match(/```mermaid\s*\n([\s\S]*?)```/);
if (fenced) src = fenced[1];

const lines = src
  .split('\n')
  .map((l) => l.replace(/%%.*$/, '').trim())
  .filter(Boolean);
const clean = (s) =>
  s
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ');
const short = (s, n = 3) => {
  const words = clean(s).split(' ');
  return words.length > n ? words.slice(0, n).join(' ') + '…' : words.join(' ');
};
const slug = (s) => s.replace(/[^A-Za-z0-9_-]/g, '_');
/** Room between boxes for the widest edge label (11px monospace) plus the arrowhead. */
const gapFor = (edges) => Math.max(80, Math.ceil(Math.max(0, ...edges.map((e) => [...(e.label ?? '')].length)) * 6.6 + 50));

let title;
for (const l of lines) {
  const m = l.match(/^title:?\s+(.*)$/);
  if (m) title = clean(m[1]);
}
const kind = lines.find((l) => /^(sequenceDiagram|flowchart|graph)\b/.test(l));
if (!kind) {
  console.error('Only sequenceDiagram and flowchart/graph are supported.');
  process.exit(1);
}
const body = lines.slice(lines.indexOf(kind) + 1).filter((l) => !/^title\b/.test(l));
const spec = kind.startsWith('sequenceDiagram') ? fromSequence(body) : fromFlowchart(body, kind.split(/\s+/)[1] ?? 'TD');
spec.title = title ?? spec.title;
const json = JSON.stringify({ title: spec.title, props: spec.props }, null, 2);
if (out) writeFileSync(out, json + '\n');
else console.log(json);

function fromSequence(body) {
  const nodes = new Map(); // id -> label
  const groups = []; // { label, ids }
  const edges = [];
  const edgeOf = new Map(); // "a>b" -> edge id
  const common = [],
    branches = []; // [{ label, beats }]
  const stack = []; // open blocks
  let splitDone = false;
  const participant = (id, label) => {
    if (!nodes.has(id)) nodes.set(id, clean(label ?? id));
    const box = stack.findLast((b) => b.type === 'box');
    if (box && !box.ids.includes(id)) box.ids.push(id);
  };
  const sink = () => {
    const alt = stack.find((b) => b.split);
    return alt ? alt.current : common;
  };
  const order = () => [...nodes.keys()];

  for (const l of body) {
    let m;
    if ((m = l.match(/^(participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/))) participant(m[2], m[3] ?? m[2]);
    else if ((m = l.match(/^box\b\s*(.*)$/))) {
      const label = m[1].replace(/^(rgba?\([^)]*\)|transparent|[A-Za-z]+(?=\s))\s*/, '').trim() || 'Group';
      const box = { type: 'box', label: clean(label), ids: [] };
      groups.push(box);
      stack.push(box);
    } else if ((m = l.match(/^(alt|opt|loop|par|critical|break|rect)\b\s*(.*)$/))) {
      const block = { type: m[1], split: false };
      if (m[1] === 'alt' && !splitDone && !stack.some((b) => b.split)) {
        splitDone = block.split = true;
        block.current = [];
        branches.push({ label: clean(m[2] || 'case 1'), beats: block.current, start: common.length });
      }
      stack.push(block);
    } else if ((m = l.match(/^(else|and|option)\b\s*(.*)$/))) {
      const block = stack.at(-1);
      if (block?.split) {
        block.current = [];
        branches.push({ label: clean(m[2] || `case ${branches.length + 1}`), beats: block.current, start: common.length });
      } else if (block) block.skip = m[1] === 'else'; // later alts: play only the first branch
    } else if (l === 'end') {
      stack.pop();
    } else if ((m = l.match(/^Note\s+(?:over|left of|right of)\s+([^:]+):\s*(.*)$/i))) {
      if (stack.some((b) => b.skip)) continue;
      const ids = m[1].split(',').map((s) => s.trim());
      ids.forEach((id) => participant(id));
      sink().push({ light: ids, say: clean(m[2]) });
    } else if ((m = l.match(/^([^\s:>-][^:>]*?)\s*(--?>>|--?>|--?x|--?\)|<<--?>>)\s*[+-]?\s*([^:]+?)\s*:\s*(.*)$/))) {
      if (stack.some((b) => b.skip)) continue;
      const [, a, arrow, b, text] = m;
      participant(a.trim());
      participant(b.trim());
      const from = a.trim(),
        to = b.trim();
      const dashed = arrow.startsWith('--');
      let hop;
      if (dashed && edgeOf.has(`${to}>${from}`) && !edgeOf.has(`${from}>${to}`)) hop = { edge: edgeOf.get(`${to}>${from}`), back: true };
      else {
        if (!edgeOf.has(`${from}>${to}`)) {
          const id = slug(`${from}-${to}`);
          edgeOf.set(`${from}>${to}`, id);
          edges.push({ id, from: slug(from), to: slug(to), label: short(text) });
        }
        hop = { edge: edgeOf.get(`${from}>${to}`) };
      }
      if (dashed) hop.data = short(text, 4);
      sink().push({ edges: hop, say: clean(text) || `${nodes.get(from)} → ${nodes.get(to)}` });
    }
  }

  // Edges that skip over participants arc around them instead of cutting through.
  const idx = new Map(order().map((id, i) => [slug(id), i]));
  for (const e of edges) {
    const d = idx.get(e.to) - idx.get(e.from);
    if (Math.abs(d) > 1) e.around = d > 0 ? 'above' : 'below';
  }
  const box = (id) => ({ id: slug(id), label: nodes.get(id) });
  const grouped = new Set(groups.flatMap((g) => g.ids));
  const children = [];
  for (const id of order()) {
    if (!grouped.has(id)) children.push(box(id));
    else {
      const g = groups.find((x) => x.ids.includes(id));
      if (!g.placed) {
        g.placed = true;
        children.push({ label: g.label, gap: gapFor(edges), children: g.ids.map(box) });
      }
    }
  }
  const steps = branches.length
    ? branches.map((b) => ({ label: b.label, flow: [...common.slice(0, b.start), ...b.beats, ...common.slice(b.start)] }))
    : [{ label: 'flow', flow: common }];
  return { title: 'Sequence', props: { speed: 1500, layout: { gap: gapFor(edges), children }, edges, steps } };
}

function fromFlowchart(body, dir) {
  const nodes = new Map(); // id -> { label, shape }
  const edges = [];
  const root = { id: null, label: null, kids: [], dir };
  const stack = [root];
  const where = new Map(); // node id -> subgraph
  const NODE =
    /^([A-Za-z0-9_][\w.-]*)\s*(\[\(.*?\)\]|\(\(.*?\)\)|\(\[.*?\]\)|\[\[.*?\]\]|\{\{.*?\}\}|\[\/.*?[/\\]\]|\[\\.*?[/\\]\]|\[.*?\]|\(.*?\)|\{.*?\}|>.*?\])?(?::::\w+)?/;
  const LINK = /^\s*(?:(--|==|-\.)\s+([^|>]+?)\s+)?(<?(?:-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|--[ox]))(?:\|([^|]*)\|)?\s*/;
  const node = (id, raw) => {
    const known = nodes.get(id);
    if (raw) {
      const shape = raw.startsWith('[(') ? 'store' : raw.startsWith('{') && !raw.startsWith('{{') ? 'decision' : undefined;
      const label = clean(raw.replace(/^[[({>/\\]+|[\])}/\\]+$/g, ''));
      nodes.set(id, { label, shape });
    } else if (!known) nodes.set(id, { label: id });
    if (!where.has(id)) {
      where.set(id, stack.at(-1));
      stack.at(-1).kids.push({ node: id });
    }
  };
  const nodeGroup = (s) => {
    const ids = [];
    let rest = s;
    for (;;) {
      const m = rest.match(NODE);
      if (!m) break;
      node(m[1], m[2]);
      ids.push(m[1]);
      rest = rest.slice(m[0].length);
      const amp = rest.match(/^\s*&\s*/);
      if (!amp) break;
      rest = rest.slice(amp[0].length);
    }
    return { ids, rest };
  };

  for (const l of body) {
    let m;
    if ((m = l.match(/^subgraph\s+(\S+?)(?:\s*\[(.*)\])?\s*$/)) || (m = l.match(/^subgraph\s+(.+)$/))) {
      const sg = { id: slug(m[1]), label: clean(m[2] ?? m[1]), kids: [], dir: stack.at(-1).dir };
      stack.at(-1).kids.push({ group: sg });
      stack.push(sg);
    } else if (l === 'end') stack.length > 1 && stack.pop();
    else if ((m = l.match(/^direction\s+(\w+)/))) stack.at(-1).dir = m[1];
    else if (/^(classDef|class|style|linkStyle|click)\b/.test(l)) continue;
    else {
      let { ids: prev, rest } = nodeGroup(l);
      while (prev.length && rest) {
        const link = rest.match(LINK);
        if (!link) break;
        const next = nodeGroup(rest.slice(link[0].length));
        const label = link[2] ?? link[4];
        for (const a of prev)
          for (const b of next.ids)
            edges.push({ id: `e${edges.length + 1}`, from: a, to: b, ...(label?.trim() ? { label: short(label, 4) } : {}) });
        prev = next.ids;
        rest = next.rest;
      }
    }
  }

  // Rank = longest path from a source, ignoring edges that close a cycle.
  const out = new Map([...nodes.keys()].map((id) => [id, []]));
  const back = new Set();
  const state = new Map();
  const dfs = (id) => {
    state.set(id, 1);
    for (const e of edges.filter((x) => x.from === id)) {
      if (state.get(e.to) === 1) back.add(e.id);
      else if (!state.has(e.to)) dfs(e.to);
    }
    state.set(id, 2);
  };
  [...nodes.keys()].forEach((id) => state.has(id) || dfs(id));
  for (const e of edges) if (!back.has(e.id)) out.get(e.from).push(e.to);
  const rank = new Map();
  const rankOf = (id) => {
    if (rank.has(id)) return rank.get(id);
    rank.set(id, 0);
    const ins = edges.filter((e) => e.to === id && !back.has(e.id)).map((e) => rankOf(e.from) + 1);
    rank.set(id, Math.max(0, ...ins));
    return rank.get(id);
  };
  [...nodes.keys()].forEach(rankOf);

  const across = (d) => (/^(LR|RL)$/.test(d) ? 'row' : 'column');
  const members = (g) => g.kids.flatMap((k) => (k.node ? [k.node] : members(k.group)));
  const arrange = (g) => {
    const units = g.kids.map((k) => {
      if (k.node) return { r: rank.get(k.node), item: { id: slug(k.node), label: nodes.get(k.node).label, ...(nodes.get(k.node).shape ? { shape: nodes.get(k.node).shape } : {}) } };
      const inner = arrange(k.group);
      return { r: Math.min(...members(k.group).map((id) => rank.get(id))), item: { id: k.group.id, label: k.group.label, ...inner } };
    });
    const ranks = [...new Set(units.map((u) => u.r))].sort((a, b) => a - b);
    if (/^(RL|BT)$/.test(g.dir)) ranks.reverse();
    const flow = across(g.dir);
    const cols = ranks.map((r) => {
      const at = units.filter((u) => u.r === r).map((u) => u.item);
      return at.length === 1 ? at[0] : { direction: flow === 'row' ? 'column' : 'row', gap: 28, children: at };
    });
    return { direction: flow, gap: flow === 'row' ? gapFor(edges) : 60, children: cols };
  };

  const horizontal = across(dir) === 'row';
  for (const e of edges) {
    e.from = slug(e.from);
    e.to = slug(e.to);
    if (back.has(e.id) && horizontal) e.around = 'below';
  }

  // Steps: walk from the first source; each branch of the first decision gets its own step.
  const walk = (start, seen = new Set()) => {
    const path = [];
    let at = start;
    while (at && !seen.has(at)) {
      seen.add(at);
      const e = edges.find((x) => x.from === slug(at) && !back.has(x.id));
      if (!e) break;
      path.push(e);
      at = [...nodes.keys()].find((id) => slug(id) === e.to);
    }
    return path;
  };
  const beat = (e) => {
    const a = [...nodes.entries()].find(([id]) => slug(id) === e.from)[1].label;
    const b = [...nodes.entries()].find(([id]) => slug(id) === e.to)[1].label;
    return { edges: e.id, say: e.label ? `${a} → ${b}: ${e.label}.` : `${a} → ${b}.` };
  };
  const start = [...nodes.keys()].find((id) => rank.get(id) === 0);
  const trunk = [];
  const seen = new Set();
  let at = start,
    fork;
  while (at && !seen.has(at)) {
    seen.add(at);
    const outs = edges.filter((x) => x.from === slug(at) && !back.has(x.id));
    if (outs.length > 1 && nodes.get(at).shape === 'decision') {
      fork = outs;
      break;
    }
    if (!outs[0]) break;
    trunk.push(outs[0]);
    at = [...nodes.keys()].find((id) => slug(id) === outs[0].to);
  }
  const steps = fork
    ? fork.map((e) => {
        const to = [...nodes.keys()].find((id) => slug(id) === e.to);
        return { label: e.label ?? nodes.get(to).label, flow: [...trunk, e, ...walk(to, new Set(seen))].map(beat) };
      })
    : [{ label: 'flow', flow: (trunk.length ? trunk : edges).slice(0, 20).map(beat) }];

  return { title: 'Flowchart', props: { speed: 1400, layout: arrange(root), edges, steps } };
}
