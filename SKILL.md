---
name: traceframe
description: Draw an animated, step-by-step system diagram (boxes, nested groups, arrows, packets moving along edges, cards filling with data) as an interactive HTML page or a self-contained animated SVG. Use when the user wants to show how something flows or works — a request path, a pipeline, an agent loop, what an API call does, an architecture walkthrough — or asks for an animated / interactive / "clean like the Hindsight docs" diagram.
---

# Traceframe

Renders a JSON spec with **interfig** (the MIT-licensed figure player from the Hindsight docs,
vendored in `interfig/`). You describe *what* is in the picture and *what happens*; the renderer does
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
| **Interactive HTML** | `node scripts/html.mjs spec.json out.html` | Artifacts, web pages, docs, anything viewed in a browser. Step tabs, pause, 1×/2×, hover-to-highlight, full-screen. ~240 kB, one file, no network. |
| **Animated SVG** | `node scripts/svg.mjs spec.json out.svg` | GitHub README / PR / issue, blog posts, Notion — anywhere markdown shows an `<img>`. No controls: every step plays in a loop. 15–180 kB. |

Default to **HTML** when the user will view it here or share a page; **SVG** when it goes into
markdown. Either takes `-` to read the spec from stdin. Options for HTML: `--title "…"`,
`--accent "#hex"`. The first HTML run installs react/esbuild into `~/.cache/traceframe` (npm needed).

Both outputs embed their spec, so any figure is editable later:
`node scripts/html.mjs --spec out.html` (or `svg.mjs --spec out.svg`) prints it back.

## 2. Write the spec

Start from `examples/starter.json` (a small, generic two-scenario figure). For bigger patterns read
one of the real figures in `examples/` — `what-hindsight-does.json` (three scenarios, nested stores,
entity graph), `tempr.json` (four branches in parallel then a ranking pipeline), `retain.json`,
`reflect.json`, `services.json`, `observations.json`.

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
`theme` `{ accent, fg, muted, bg, surface, border, font }` (rarely needed — the HTML page already
does light/dark; use `--accent` for brand color).

### What makes it look good

- **Real example data**, not placeholders: "Ada Lovelace · id 42" beats "Record". One running
  example through all steps (the Hindsight figures follow "Alice" everywhere).
- **Few words**: labels 1–3 words, `sub` ≤ 4 words, card rows ≤ ~40 chars, captions ≤ 15 words.
- **2–4 steps, 3–7 beats each.** Each step answers one question ("cache miss", "cache hit").
- **Honest**: every label, card and caption must match what the system really does. If you are
  diagramming the user's code, read the code first.

## 3. Render and look at it — always

The scripts validate ids (unknown edge/box ids, duplicates) and exit with a list of problems; fix
and re-run. Then look at the result before handing it over — overflowing text, an arrow crossing a
box, or a caption that doesn't match the motion are invisible in JSON. Screenshot the HTML with any
available browser tool (serve it with `python3 -m http.server` if `file://` is blocked), once
early and once a few seconds later to catch a later beat. Tweak `gap`, `direction`, `around`,
`quiet`, `width` and re-render.

## 4. Deliver

- **HTML**: if an Artifact / publish tool is available, publish the HTML file as-is (it is fully
  self-contained). Otherwise send the file. It can also be dropped into any site or `<iframe>`.
- **SVG**: commit it and reference it from markdown (`![how caching works](docs/cache.svg)`), or
  send the file. GitHub renders and animates it in READMEs, PRs and issues.
- Don't leave spec `.json` files lying around in the user's project — the output carries its spec.

## Credits

`interfig/` is copied from github.com/vectorize-io/hindsight (`hindsight-interfig/`), MIT license
in `interfig/LICENSE`. `examples/` except `starter.json` are the Hindsight docs figures converted
to JSON.
