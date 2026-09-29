# Traceframe

**Turn system behavior into animated, step-by-step diagrams.**

Traceframe is an agent skill for explaining request paths, pipelines, agent loops, distributed systems, and architecture walkthroughs. Describe the layout and story as JSON; Traceframe renders either an interactive HTML player or a self-contained animated SVG.

[![Install with npx skills](https://img.shields.io/badge/install-npx%20skills%20add%20shashankswe2020--ux%2Ftraceframe-111111?logo=npm&logoColor=white)](#install)
[![Works with Claude Code, Codex, Cursor, Copilot](https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor%20%C2%B7%20Copilot-6d28d9)](https://github.com/vercel-labs/skills#supported-agents)
[![Output: HTML + animated SVG](https://img.shields.io/badge/output-HTML%20%2B%20animated%20SVG-0b7285)](#gallery)
[![Node.js 22.18+](https://img.shields.io/badge/node-%E2%89%A522.18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-0b7285.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/shashankswe2020-ux/traceframe?style=flat&logo=github)](https://github.com/shashankswe2020-ux/traceframe/stargazers)

![OAuth 2.0 Authorization Code with PKCE](diagrams/oauth-pkce.svg)

## Why Traceframe

- One declarative JSON spec, with no hand-written SVG or React.
- Animated packets, changing data cards, decisions, stores, nested systems, and narrated beats.
- Interactive HTML with tabs, pause, speed, hover highlighting, and full screen.
- Portable SVG that animates in GitHub READMEs, pull requests, and documentation.
- Self-contained outputs with the source spec embedded for later editing.

## Install

One command installs Traceframe into Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode, and [70+ other agents](https://github.com/vercel-labs/skills#supported-agents):

```sh
npx skills add shashankswe2020-ux/traceframe
```

The CLI detects your installed agents and asks where to put the skill. To skip the prompts:

```sh
# Global install for Claude Code and Codex
npx skills add shashankswe2020-ux/traceframe -g -a claude-code -a codex -y

# This project only, every detected agent
npx skills add shashankswe2020-ux/traceframe -y
```

Update later with `npx skills update traceframe`, and remove with `npx skills remove traceframe`. Rendering requires Node.js 22.18 or newer.

<details>
<summary>Manual install</summary>

Clone the repository into your agent's skills directory, for example:

```sh
git clone https://github.com/shashankswe2020-ux/traceframe.git ~/.claude/skills/traceframe   # Claude Code
git clone https://github.com/shashankswe2020-ux/traceframe.git ~/.codex/skills/traceframe    # Codex
git clone https://github.com/shashankswe2020-ux/traceframe.git ~/.copilot/skills/traceframe  # GitHub Copilot
```

</details>

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