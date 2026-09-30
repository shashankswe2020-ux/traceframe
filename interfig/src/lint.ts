// Layout checks a screenshot would catch: arrows through boxes, labels on top of each other,
// crowded box sides, and arrows that cross. Uses the SVG renderer's layout, so the HTML player
// (measured by the browser) can differ by a few pixels.
import type { Rect } from './geometry.ts';
import { isGroup, type FigGroup, type FigNode, type FlowProps } from './model.ts';
import { labelWidth, layoutFigure } from './svg.ts';

export type Finding = { rule: 'crosses-box' | 'label-overlap' | 'crowded-side' | 'edges-cross'; message: string };

type Pt = { x: number; y: number };

/** Points along a routed path: `M sx sy C c1x c1y, c2x c2y, ex ey`. */
function sample(d: string, n = 48): Pt[] {
  const [sx, sy, ax, ay, bx, by, ex, ey] = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n,
      u = 1 - t;
    return {
      x: u * u * u * sx + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * ex,
      y: u * u * u * sy + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * ey,
    };
  });
}

const inside = (p: Pt, r: Rect, diamond: boolean, m = 4) => {
  if (diamond) return Math.abs(p.x - (r.x + r.w / 2)) / (r.w / 2) + Math.abs(p.y - (r.y + r.h / 2)) / (r.h / 2) < 0.92;
  return p.x > r.x + m && p.x < r.x + r.w - m && p.y > r.y + m && p.y < r.y + r.h - m;
};
const overlap = (a: Rect, b: Rect, m = 2) => a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m;

function cross(p: Pt, q: Pt, r: Pt, s: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p, q, r) * d(p, q, s) < 0 && d(r, s, p) * d(r, s, q) < 0;
}

/** Ids of a box or group and everything nested in it. */
function family(item: FigNode | FigGroup, out = new Set<string>()): Set<string> {
  if (item.id) out.add(item.id);
  if (isGroup(item)) item.children.forEach((c) => family(c, out));
  return out;
}

export function lint(fig: FlowProps): Finding[] {
  const { placed, rects, routed, ids } = layoutFigure(fig);
  const found: Finding[] = [];
  const leaves = placed.filter((p) => !isGroup(p.item)) as (Rect & { item: FigNode })[];
  const byId = new Map(placed.filter((p) => p.item.id).map((p) => [p.item.id!, p]));
  const ends = (id: string) => (byId.has(id) ? family(byId.get(id)!.item) : new Set([id]));
  const edges = routed.map((r) => {
    const e = fig.edges[ids.indexOf(r.id)];
    return { r, e, pts: sample(r.d), mine: new Set([...ends(e.from), ...ends(e.to)]) };
  });
  const name = (e: { from: string; to: string }, id: string) => `"${id}" (${e.from} → ${e.to})`;

  for (const { r, e, pts, mine } of edges) {
    for (const box of leaves) {
      if (mine.has(box.item.id)) continue;
      if (pts.slice(2, -2).some((p) => inside(p, box, box.item.shape === 'decision')))
        found.push({
          rule: 'crosses-box',
          message: `edge ${name(e, r.id)} passes through box "${box.item.id}". Put ${e.from} and ${e.to} next to each other, route it with "around", or replay an existing edge with "back": true.`,
        });
    }
  }

  const labels = edges
    .filter(({ e }) => e.label != null && !e.quiet)
    .map(({ r, e }) => {
      const w = labelWidth(String(e.label));
      return { id: r.id, e, box: { x: r.mid.x - w / 2, y: r.mid.y - 9, w, h: 18 } };
    });
  labels.forEach((a, i) => {
    for (const b of labels.slice(i + 1))
      if (overlap(a.box, b.box))
        found.push({ rule: 'label-overlap', message: `labels of edges "${a.id}" and "${b.id}" overlap. Widen the gap between the boxes or shorten a label.` });
    for (const box of leaves)
      if (overlap(a.box, box, 4))
        found.push({ rule: 'label-overlap', message: `label of edge "${a.id}" sits on box "${box.item.id}". Widen the gap between the boxes.` });
  });

  // Anchors per box side, read off where each path starts and ends.
  const sides = new Map<string, number>();
  const tips = new Set(leaves.filter((b) => b.item.shape === 'decision').map((b) => b.item.id));
  for (const { e, pts } of edges) {
    for (const [id, p] of [
      [e.from, pts[0]],
      [e.to, pts.at(-1)!],
    ] as const) {
      const b = rects[id];
      if (!b || tips.has(id)) continue;
      const gaps = { left: Math.abs(p.x - b.x), right: Math.abs(p.x - b.x - b.w), top: Math.abs(p.y - b.y), bottom: Math.abs(p.y - b.y - b.h) };
      const side = (Object.keys(gaps) as (keyof typeof gaps)[]).reduce((m, k) => (gaps[k] < gaps[m] ? k : m));
      const key = `${id}\u0000${side}`;
      sides.set(key, (sides.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of sides) {
    const [id, side] = key.split('\u0000');
    if (n > 4)
      found.push({
        rule: 'crowded-side',
        message: `box "${id}" has ${n} arrows on its ${side} side. Replay replies with "back": true instead of adding return edges, or split the box.`,
      });
  }

  edges.forEach((a, i) => {
    for (const b of edges.slice(i + 1)) {
      if (a.e.quiet || b.e.quiet) continue;
      if ([a.e.from, a.e.to].some((x) => x === b.e.from || x === b.e.to)) continue;
      let hit = false;
      for (let j = 1; j < a.pts.length && !hit; j++)
        for (let k = 1; k < b.pts.length && !hit; k++) hit = cross(a.pts[j - 1], a.pts[j], b.pts[k - 1], b.pts[k]);
      if (hit)
        found.push({
          rule: 'edges-cross',
          message: `edges "${a.r.id}" and "${b.r.id}" cross. Reorder boxes inside their column so the arrows run parallel.`,
        });
    }
  });

  return found;
}
