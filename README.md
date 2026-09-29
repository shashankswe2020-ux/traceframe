# Traceframe

**Turn system behavior into animated, step-by-step diagrams.**

Traceframe is an agent skill for explaining request paths, pipelines, agent loops, distributed systems, and architecture walkthroughs. Describe the layout and story as JSON; Traceframe renders either an interactive HTML player or a self-contained animated SVG.

[![MIT License](https://img.shields.io/badge/license-MIT-0b7285.svg)](LICENSE)

![OAuth 2.0 Authorization Code with PKCE](diagrams/oauth-pkce.svg)

## Why Traceframe

- One declarative JSON spec, with no hand-written SVG or React.
- Animated packets, changing data cards, decisions, stores, nested systems, and narrated beats.
- Interactive HTML with tabs, pause, speed, hover highlighting, and full screen.
- Portable SVG that animates in GitHub READMEs, pull requests, and documentation.
- Self-contained outputs with the source spec embedded for later editing.

## Install

Traceframe requires Node.js 22.18 or newer. Clone it into the skills directory used by your coding agent. For GitHub Copilot:

```sh
git clone https://github.com/shashankswe2020-ux/traceframe.git ~/.copilot/skills/traceframe
```

You can also place the repository at `.github/skills/traceframe` inside a project to share it with collaborators.

Then ask your agent for something like:

> Use Traceframe to explain our checkout request, including cache-hit and cache-miss paths.

## Render

Run commands from the repository root:

```sh
# Interactive browser experience
node scripts/html.mjs examples/starter.json figure.html

# Animated image for Markdown
node scripts/svg.mjs examples/starter.json figure.svg
```

Both renderers validate node and edge references before writing output. The HTML renderer installs its build-only dependencies into `~/.cache/traceframe` on first use; the SVG renderer has no package installation step.

## Gallery

### Grounded RAG answer pipeline

Hybrid retrieval, ACL filtering, reranking, citation verification, and an honest insufficient-evidence path.

![Grounded RAG answer pipeline](diagrams/rag-pipeline.svg)

### Event-driven order fulfillment

Transactional outbox publishing, parallel consumers, idempotent delivery, retries, dead letters, and compensation.

![Event-driven order fulfillment](diagrams/event-driven-order.svg)

### Automated incident response

Signal correlation, evidence-first triage, human approval, progressive rollback, and recovery verification.

![Automated incident response](diagrams/incident-response.svg)

The fourth full example, shown at the top of this README, walks through OAuth 2.0 Authorization Code with PKCE, token rotation, and secure storage.

Rebuild all checked-in diagrams with:

```sh
npm run gallery
```

The corresponding editable specs live in [`examples/`](examples/).

## Spec Shape

```json
{
  "title": "Cached API request",
  "props": {
    "speed": 1400,
    "layout": { "children": [] },
    "edges": [],
    "steps": []
  }
}
```

See [`SKILL.md`](SKILL.md) for the full authoring guide and [`examples/starter.json`](examples/starter.json) for a compact starting point.

## Credits

The figure player in [`interfig/`](interfig/) comes from Vectorize's Hindsight project and retains its original MIT license. The Traceframe skill, render scripts, and original gallery examples are also MIT licensed.