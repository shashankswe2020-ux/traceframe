#!/usr/bin/env node
/**
 * A real distributed trace → Traceframe spec: replay an actual request, with its real timings.
 *
 *   node scripts/from-otel.mjs trace.json > spec.json
 *   node scripts/from-otel.mjs trace.json spec.json [--max-beats 24]
 *
 * Reads OTLP JSON (an OpenTelemetry collector file export or /v1/traces body), Jaeger JSON (the UI's
 * "Download JSON"), or Zipkin v2 JSON. Services become boxes; databases, queues and external hosts
 * seen only from client spans become stores or boxes; each cross-service call becomes an edge.
 * Every trace in the file becomes one step: calls go out when they start and come back, with their
 * duration, when they end. Calls that start together move together.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: { 'max-beats': { type: 'string', default: '24' } } });
const [input, out] = positionals;
if (!input) {
  console.error('usage: node scripts/from-otel.mjs trace.json [spec.json] [--max-beats 24]');
  process.exit(1);
}
const json = JSON.parse(readFileSync(input === '-' ? 0 : input, 'utf8'));
const KIND = { 1: 'internal', 2: 'server', 3: 'client', 4: 'producer', 5: 'consumer' };
const kindOf = (k) => (typeof k === 'number' ? KIND[k] : String(k ?? 'internal').replace(/^SPAN_KIND_/, '').toLowerCase()) ?? 'internal';
const attrs = (list) => Object.fromEntries((list ?? []).map((a) => [a.key, a.value && typeof a.value === 'object' ? Object.values(a.value)[0] : a.value]));
const ms = (nanos) => Number(BigInt(nanos) / 1000n) / 1000;

/** Every span as { trace, id, parent, service, name, kind, start, end (ms), error, attrs }. */
const spans = [];
if (json.resourceSpans) {
  for (const rs of json.resourceSpans) {
    const service = attrs(rs.resource?.attributes)['service.name'] ?? 'unknown';
    for (const ss of rs.scopeSpans ?? rs.instrumentationLibrarySpans ?? [])
      for (const s of ss.spans ?? [])
        spans.push({
          trace: s.traceId,
          id: s.spanId,
          parent: s.parentSpanId || null,
          service,
          name: s.name,
          kind: kindOf(s.kind),
          start: ms(s.startTimeUnixNano),
          end: ms(s.endTimeUnixNano),
          error: s.status?.code === 2 || s.status?.code === 'STATUS_CODE_ERROR',
          attrs: attrs(s.attributes),
        });
  }
} else if (json.data) {
  for (const t of json.data)
    for (const s of t.spans) {
      const tags = Object.fromEntries((s.tags ?? []).map((x) => [x.key, x.value]));
      spans.push({
        trace: s.traceID,
        id: s.spanID,
        parent: s.references?.find((r) => r.refType === 'CHILD_OF')?.spanID ?? null,
        service: t.processes?.[s.processID]?.serviceName ?? 'unknown',
        name: s.operationName,
        kind: kindOf(tags['span.kind']),
        start: s.startTime / 1000,
        end: (s.startTime + s.duration) / 1000,
        error: tags.error === true || tags.error === 'true' || tags['otel.status_code'] === 'ERROR',
        attrs: tags,
      });
    }
} else if (Array.isArray(json) && json[0]?.traceId) {
  for (const s of json)
    spans.push({
      trace: s.traceId,
      id: s.id,
      parent: s.parentId ?? null,
      service: s.localEndpoint?.serviceName ?? 'unknown',
      name: s.name ?? '',
      kind: kindOf(s.kind),
      start: s.timestamp / 1000,
      end: (s.timestamp + (s.duration ?? 0)) / 1000,
      error: 'error' in (s.tags ?? {}),
      attrs: { ...s.tags, ...(s.remoteEndpoint?.serviceName ? { 'peer.service': s.remoteEndpoint.serviceName } : {}) },
    });
} else {
  console.error('Not a trace: expected OTLP JSON (resourceSpans), Jaeger JSON (data[].spans) or Zipkin v2 (an array of spans).');
  process.exit(1);
}
if (!spans.length) {
  console.error('The file has no spans.');
  process.exit(1);
}

const slug = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '-');
const short = (s, n = 3) => {
  const w = String(s).trim().split(/\s+/);
  return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ');
};
const fmt = (d) => (d < 10 ? `${d.toFixed(1)} ms` : d < 10000 ? `${Math.round(d)} ms` : `${(d / 1000).toFixed(1)} s`);

const boxes = new Map(); // id -> { id, label, sub?, shape? }
const service = (name) => {
  const id = slug(name);
  if (!boxes.has(id)) boxes.set(id, { id, label: name });
  return id;
};
/** The database, queue or host a client span talks to, when no traced service answers it. */
function peer(s) {
  const a = s.attrs;
  if (a['db.system']) {
    const label = a['db.namespace'] ?? a['db.name'] ?? a['db.system'];
    return { id: slug(`db-${a['db.system']}-${label}`), label, sub: a['db.system'], shape: 'store' };
  }
  if (a['messaging.system']) {
    const label = a['messaging.destination.name'] ?? a['messaging.destination'] ?? a['messaging.system'];
    return { id: slug(`mq-${label}`), label, sub: a['messaging.system'], shape: 'store' };
  }
  const url = a['url.full'] ?? a['http.url'];
  const host = a['peer.service'] ?? a['server.address'] ?? a['net.peer.name'] ?? (url ? new URL(url).host : undefined) ?? a['rpc.service'];
  return host ? { id: slug(`ext-${host}`), label: host, sub: 'external' } : null;
}
const opName = (s) => {
  const a = s.attrs;
  if (a['db.system']) return a['db.operation.name'] ?? a['db.operation'] ?? String(a['db.query.text'] ?? a['db.statement'] ?? s.name).split(/\s+/)[0];
  return s.name;
};

const edges = new Map(); // "a>b" -> edge
const edge = (from, to, name) => {
  const key = `${from}>${to}`;
  if (!edges.has(key)) edges.set(key, { id: slug(`${from}--${to}`), from, to, label: short(name, 3) });
  return edges.get(key).id;
};

const traces = [...new Set(spans.map((s) => s.trace))].slice(0, 4);
const maxBeats = Number(opt['max-beats']);
const steps = [];
for (const traceId of traces) {
  const list = spans.filter((s) => s.trace === traceId);
  const byId = new Map(list.map((s) => [s.id, s]));
  const root = list.filter((s) => !s.parent || !byId.has(s.parent)).sort((a, b) => a.start - b.start)[0];
  const calls = [];
  if (root.kind === 'server' || root.kind === 'consumer') {
    boxes.set('client', { id: 'client', label: root.kind === 'consumer' ? 'Producer' : 'Client' });
    calls.push({ from: 'client', to: service(root.service), name: root.name, start: root.start, end: root.end, error: root.error });
  }
  for (const s of list) {
    service(s.service);
    const p = s.parent && byId.get(s.parent);
    if (p && p.service !== s.service) {
      const outer = p.kind === 'client' || p.kind === 'producer' ? p : s;
      calls.push({ from: service(p.service), to: service(s.service), name: s.name, start: outer.start, end: outer.end, error: s.error || p.error });
    } else if ((s.kind === 'client' || s.kind === 'producer') && !list.some((x) => x.parent === s.id && x.service !== s.service)) {
      const target = peer(s);
      if (!target) continue;
      if (!boxes.has(target.id)) boxes.set(target.id, target);
      calls.push({ from: service(s.service), to: target.id, name: opName(s), start: s.start, end: s.end, error: s.error, oneWay: s.kind === 'producer' });
    }
  }
  for (const c of calls) c.edge = edge(c.from, c.to, c.name);

  // Calls leave when they start and return when they end; events within 1 ms move together.
  const events = calls
    .flatMap((c) => [{ t: c.start, out: true, c }, ...(c.oneWay ? [] : [{ t: c.end, out: false, c }])])
    .sort((a, b) => a.t - b.t || Number(a.out) - Number(b.out));
  const groups = [];
  for (const ev of events) {
    const last = groups.at(-1);
    if (last && last[0].out === ev.out && ev.t - last[0].t <= 1) last.push(ev);
    else groups.push([ev]);
  }
  const label = (id) => boxes.get(id).label;
  const beats = groups.map((g) => {
    const show = {};
    if (g[0].out) {
      for (const { c } of g) show[c.to] = [{ tag: 'call', tone: 'blue', text: c.name, meta: 'running' }];
      return {
        edges: g.map(({ c }) => ({ edge: c.edge, data: short(c.name, 3) })),
        show,
        say: g.length === 1 ? `${label(g[0].c.from)} calls ${label(g[0].c.to)}: ${g[0].c.name}.` : `${g.length} calls start together: ${g.map(({ c }) => label(c.to)).join(', ')}.`,
      };
    }
    for (const { c } of g)
      show[c.to] = [{ tag: c.error ? 'error' : 'done', tone: c.error ? 'orange' : 'green', text: c.name, meta: fmt(c.end - c.start), mark: c.error ? '✕' : '✓' }];
    const c = g[0].c;
    return {
      edges: g.map(({ c }) => ({ edge: c.edge, back: true, data: c.error ? 'error' : fmt(c.end - c.start) })),
      show,
      say:
        g.length > 1
          ? `${g.length} calls return: ${g.map(({ c }) => `${label(c.to)} ${fmt(c.end - c.start)}`).join(', ')}.`
          : c.error
            ? `${label(c.to)} fails after ${fmt(c.end - c.start)}.`
            : `${label(c.to)} answers in ${fmt(c.end - c.start)}.`,
    };
  });
  if (beats.length > maxBeats) console.error(`trace ${traceId}: ${beats.length} moments, keeping the first ${maxBeats} (--max-beats).`);
  steps.push({ label: `${short(root.name, 3)} · ${fmt(root.end - root.start)}`, flow: beats.slice(0, maxBeats) });
}

// Columns by call depth from the entry point.
const depth = new Map();
const first = boxes.has('client') ? 'client' : slug(spans.sort((a, b) => a.start - b.start)[0].service);
const queue = [first];
depth.set(first, 0);
while (queue.length) {
  const id = queue.shift();
  for (const e of edges.values())
    if (e.from === id && !depth.has(e.to)) {
      depth.set(e.to, depth.get(id) + 1);
      queue.push(e.to);
    }
}
for (const id of boxes.keys()) if (!depth.has(id)) depth.set(id, 0);
const cols = [...new Set(depth.values())].sort((a, b) => a - b).map((d) => [...boxes.values()].filter((b) => depth.get(b.id) === d));
const longest = Math.max(0, ...[...edges.values()].map((e) => [...e.label].length));
const layout = {
  gap: Math.max(90, Math.ceil(longest * 6.6 + 60)),
  children: cols.map((c) => (c.length === 1 ? c[0] : { direction: 'column', gap: 28, children: c })),
};
const rootSpan = spans.find((s) => !s.parent) ?? spans[0];
const spec = {
  title: `Trace: ${rootSpan.service} ${rootSpan.name}`,
  props: { speed: 1300, layout, edges: [...edges.values()], steps },
};
const text = JSON.stringify(spec, null, 2);
if (out) writeFileSync(out, text + '\n');
else console.log(text);
