#!/usr/bin/env node
// Builds the GitHub Pages site into _site/: landing page, animated SVGs, and interactive demos.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, '_site');
const URL = 'https://shashankswe2020-ux.github.io/traceframe/';
const demos = {
  'oauth-pkce': 'Animated OAuth 2.0 Authorization Code with PKCE flow: sign-in, code exchange and refresh-token rotation.',
  'rag-pipeline': 'Animated RAG pipeline: hybrid retrieval, ACL filtering, reranking, generation and citation checks.',
  'event-driven-order': 'Animated event-driven architecture: transactional outbox, event bus, consumers, retries and dead letters.',
  'incident-response': 'Animated incident response workflow: alerting, evidence-first triage, human approval and rollback.',
};

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
copyFileSync(join(ROOT, 'site/index.html'), join(OUT, 'index.html'));
copyFileSync(join(ROOT, '.github/social-preview.png'), join(OUT, 'og.png'));

for (const [name, description] of Object.entries(demos)) {
  const page = join(OUT, `${name}.html`);
  const title = JSON.parse(readFileSync(join(ROOT, `examples/${name}.json`), 'utf8')).title;
  execFileSync('node', [join(ROOT, 'scripts/html.mjs'), join(ROOT, `examples/${name}.json`), page, '--title', `${title} | Traceframe interactive diagram`], { stdio: 'inherit' });
  copyFileSync(join(ROOT, `diagrams/${name}.svg`), join(OUT, `${name}.svg`));
  const head = [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${URL}${name}.html">`,
    `<meta property="og:title" content="${esc(title)} | Traceframe">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${URL}og.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n');
  const back = `<p style="margin:0 0 16px;font-size:14px"><a href="./" style="color:var(--fig-accent)">← Traceframe: animated diagrams for AI coding agents</a></p>`;
  const html = readFileSync(page, 'utf8').replace('</title>', `</title>\n${head}`).replace('<main>', `<main>${back}`);
  writeFileSync(page, html);
}

const pages = ['', ...Object.keys(demos).map((n) => `${n}.html`)];
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${URL}${p}</loc></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${URL}sitemap.xml\n`);
console.log(`site built in ${OUT}`);
