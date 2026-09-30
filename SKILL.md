---
name: traceframe
description: Draw an animated, step-by-step architecture or system-flow diagram (boxes, groups, arrows with packets moving along them, cards filling with real data, narrated steps) as an interactive HTML page, an animated SVG for GitHub READMEs and PRs, or an MP4/GIF/PNG. Use when the user wants to show how something works or flows: a request path, a sequence diagram, a data or RAG pipeline, an agent loop, an auth flow, an event-driven system, a deploy, what a PR changes, or a replay of a real OpenTelemetry trace. Also converts Mermaid sequence diagrams and flowcharts. Triggers on "architecture diagram", "sequence diagram", "explain this flow", "animate", "walk me through the request".
---

# Traceframe

Renders a JSON spec with **interfig** (an MIT-licensed figure player vendored in `interfig/`).
You describe *what* is in the picture and *what happens*; the renderer does
the layout, arrows, animation, theming and light/dark mode. **You write JSON — never hand-write SVG,
HTML or React for the figure.**

All commands run from this skill's folder (the one holding this file). Needs Node 22.18+.

## 0. Decide it is the right tool

Good fit: something *moves* between parts — data, a request, a job, a decision — and the story has
2–6 moments per scenario. Bad fit: a static org chart, a big graph of 30+ nodes, a chart of numbers.
For those, draw a plain diagram instead.

## 1. Pick the output

| Output | Command | Use for |
| --- | --- | --- |
| **Interactive HTML** | `node scripts/html.mjs spec.json out.html` | Artifacts, web pages, docs, anything viewed in a browser. Step tabs, pause, 1×/2×, beat timeline, ← → keys, `#step=N` links, hover-to-highlight, full-screen. ~40 kB, one file, no network. |
| **Animated SVG** | `node scripts/svg.mjs spec.json out.svg` | GitHub README / PR / issue, blog posts, Notion: anywhere markdown shows an `<img>`. No controls: every step plays in a loop. 15–180 kB. |
| **MP4 / GIF / PNG** | `node scripts/video.mjs spec.json out.mp4` | Slack, X, LinkedIn, slides, email, where SVG animation does not play. `--step N` for one scenario; `.png` gives a still (end of `--step`, or `--at SEC`). Needs Chrome, and ffmpeg for MP4/GIF. |

Default to **HTML** when the user will view it here or share a page; **SVG** when it goes into
markdown. HTML and SVG take `-` to read the spec from stdin, and both accept `--theme default|github|vercel|linear|contrast`
and `--accent "#hex"` (brand color); HTML also takes `--title "…"`. The first HTML run installs
pinned esbuild + preact into `~/.cache/traceframe` with `npm ci` (npm needed, about 10 s).

Both outputs embed their spec, so any figure is editable later:
`node scripts/html.mjs --spec out.html` (or `svg.mjs --spec out.svg`) prints it back.

**Starting from something that exists?**
- A Mermaid diagram: `node scripts/from-mermaid.mjs diagram.mmd spec.json` (sequenceDiagram or
  flowchart; also reads the first ```` ```mermaid ```` block of a Markdown file).
- A real trace: `node scripts/from-otel.mjs trace.json spec.json` (OTLP JSON, Jaeger JSON, or Zipkin v2).

Both give a correct skeleton. Then improve it: real data in cards, one plain sentence per `say`,
shorter labels, and a layout that passes the lint below.

## 2. Write the spec

Start from `examples/starter.json` (a small, generic two-scenario figure). For bigger patterns read
one of the gallery figures, all lint-clean:
- `examples/oauth-pkce.json`: three scenarios, replies replayed with `back: true`, frames as columns.
- `examples/rag-pipeline.json`: a U-shaped two-row pipeline with a retry loop and a group as an edge end.
- `examples/event-driven-order.json`: fan-out to consumers, a failure path, compensation.
- `examples/incident-response.json`: evidence → control plane → production, human approval.

Add `"$schema": "https://raw.githubusercontent.com/shashankswe2020-ux/traceframe/main/schema.json"`
to a spec for autocomplete and validation in editors.

```json
{ "title": "…", "props": { "speed": 1400, "layout": {…}, "edges": […], "steps": […] } }
```

### layout — a tree laid out by flexbox

- **Group**: `{ id?, label?, direction?: "row"|"column", gap?, align?: "start"|"center"|"end", children: […] }`.
  Only a group with a `label` gets a frame (drawn as an uppercase title). Unlabeled groups are just
  for arranging. Default direction is `row`.
- **Box**: `{ id, label, sub?, shape?, lines?, width? }`.
  - `shape: "store"` = database cylinder, for data at rest. Plain boxes = things that act.
    `"decision"` = diamond.
  - `sub` is the small muted second line (what it is / how it works: "by meaning", "TTL 60 s").
  - A box that any step fills with `show` gets a fixed-width content card automatically. `lines`
    sets a minimum card height; `width` fixes the width.
- Every box needs a unique, stable `id`.

Layout recipe: left-to-right = the direction of the main flow. Put the caller on the left, the
service in the middle, storage on the right. Use `column` groups to stack alternatives or pipeline
stages. Nesting depth of 2–3 labeled frames looks good; deeper gets cramped.

### Clean arrows (the lint enforces these)

- **Only connect neighbours.** An edge between boxes that are not next to each other cuts through
  whatever sits between. Move one of the boxes, or arc it with `around`.
- **Replies reuse the call's edge.** Play `{ "edge": "call", "back": true, "data": "200 OK" }`
  instead of adding a return edge. Two edges between the same boxes crowd both sides.
- **At most 4 arrows on one side of a box.** Past that, reuse edges with `back`, or split the box.
- **Order boxes inside a column by where their arrows go**, so arrows run parallel instead of crossing.
- **Long pipelines fold into a U**: a root `column` of two rows, the second row reading right to
  left, so the turn and the loop back are short vertical edges (`examples/rag-pipeline.json`).
- **Line rows up with `align: "start"`** when stacked boxes should connect straight down.
- **Leave room for labels.** A gap narrower than the edge label pushes the chip onto the boxes;
  use a `gap` of about 7 px per label character + 50.

### edges

`{ id?, from, to, label?, around?, quiet? }`. `from`/`to` are box **or group** ids. Default id is
`"from->to"`; give an explicit short `id` whenever steps reference it.
- `label` is shown as a monospace chip mid-edge — use verbs or calls: `retain()`, `SELECT`, `webhook`.
- `around: "above" | "below"` arcs the edge over/under the boxes between (loops, skip-aheads).
- `quiet: true` hides the edge until a step uses it — use for long edges that would cross everything.

### steps — each is one scenario (a tab)

`{ label, caption?, flow: [beat, …], nodes? }`. A beat is one moment:

- `edges`: an edge id; `{ "edge": id, "back": true, "data": "chip text" }` (back = runs reversed,
  data = a small card riding on the packet); or an **array** of those = run **at the same time**.
  Put sequential moves in separate beats.
- `say`: the caption under the figure while this beat plays (stays until the next `say`). Every
  beat should have one — one short, plain sentence.
- `show`: `{ boxId: content }` fills that box's card; it stays until the step ends. Content is
  either a string or **rows**: `[{ tag?, tone?, text, meta?, mark?, mono? }]`
  - `tag` a short colored label (`world`, `user`, `row`, `hit`); `tone` = `blue | purple | green | orange | gray`
  - `text` the thing itself; `meta` a muted detail after it; `mark` on the right (`✓`, `new`, `cited`, `↻`)
  - `mono: true` for code, ids, keys
  - Or an **entity graph**: `{ "graph": { "nodes": ["Alice","Google"], "links": [["Alice","Google"]], "lit": ["Alice"] } }`
    (drawn as a mini graph in HTML, as "Alice → Google" text in SVG).
  To show a card *changing*, `show` the same box again in a later beat with the new rows.
- `light: [boxId…]` highlights boxes for just this beat. No `edges` = a pause (to show a result).
- `ms`: beat length in ms (default = `speed`). Give reading-heavy beats 2500–3500.

Top-level: `speed` (ms per edge hop; 1200–2200 reads well), `autoplay` (default true),
`theme` `{ accent, onAccent, fg, muted, bg, surface, border, font }` (rarely needed; prefer the
`--theme` and `--accent` flags, which also set the dark palette).

### What makes it look good

- **Real example data**, not placeholders: "Ada Lovelace · id 42" beats "Record". One running
  example through all steps (the gallery follows one order, one user, one incident throughout).
- **Few words**: labels 1–3 words, `sub` ≤ 4 words, card rows ≤ ~40 chars, captions ≤ 15 words.
- **2–4 steps, 3–7 beats each.** Each step answers one question ("cache miss", "cache hit").
- **Honest**: every label, card and caption must match what the system really does. If you are
  diagramming the user's code, read the code first.

## 3. Render, lint, and look at it: always

The scripts reject spec mistakes (unknown ids or keys, typos like `"sho"`, invalid `tone`/`shape`)
with a list of problems; fix and re-run. They then print **layout warnings**: an arrow through a
box, overlapping labels, a crowded box side, crossing arrows. Each says how to fix it. Fix them all
and re-render until none remain (`node scripts/lint.mjs spec.json` checks without rendering;
`--strict` makes the renderers fail on warnings).

Then look at the result before handing it over: a caption that doesn't match the motion, or text
that reads badly, is invisible in JSON. `node scripts/video.mjs spec.json check.png --step N` gives
a still of step N's final state without a browser tool. Or screenshot the HTML (serve it with
`python3 -m http.server` if `file://` is blocked), once early and once a few seconds later.

## 4. Deliver

- **HTML**: if an Artifact / publish tool is available, publish the HTML file as-is (it is fully
  self-contained). Otherwise send the file. It can also be dropped into any site or `<iframe>`.
- **SVG**: commit it and reference it from markdown (`![how caching works](docs/cache.svg)`), or
  send the file. GitHub renders and animates it in READMEs, PRs and issues. It carries an
  accessible title and the step narration as its description.
- **MP4 / GIF**: attach where SVG doesn't animate. Keep GIFs to one `--step` to stay small.
- Don't leave spec `.json` files lying around in the user's project: the output carries its spec.

## Credits

`interfig/` is adapted from an MIT-licensed open-source figure player; its license and copyright
notice are in `interfig/LICENSE`.
