#!/usr/bin/env node
/**
 * Spec → MP4, GIF or PNG, for Slack, X, LinkedIn, slides and email, where an animated SVG does not
 * play. Renders the animated SVG in headless Chrome and steps its clock frame by frame, so every
 * frame is exact no matter how slow the machine is.
 *
 *   node scripts/video.mjs spec.json out.mp4 [--fps 15] [--scale 2] [--dark] [--theme github]
 *   node scripts/video.mjs spec.json out.gif --step 1      # one scenario only
 *   node scripts/video.mjs spec.json out.png --step 2      # still: the end of step 2 (default step 1)
 *   node scripts/video.mjs spec.json out.png --at 4.5      # still: 4.5 s into the loop
 *
 * Needs Chrome, Chromium, Edge or Brave (or set CHROME_PATH), and ffmpeg on PATH for MP4/GIF.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { lib } from './load.mjs';
import { mapGraphs, readSpec } from './spec.mjs';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fps: { type: 'string', default: '15' },
    scale: { type: 'string' },
    dark: { type: 'boolean' },
    theme: { type: 'string' },
    accent: { type: 'string' },
    step: { type: 'string' },
    at: { type: 'string' },
  },
});
const [input, out] = positionals;
const kind = extname(out ?? '').slice(1).toLowerCase();
if (!input || !['mp4', 'gif', 'png'].includes(kind)) {
  console.error('usage: node scripts/video.mjs spec.json out.(mp4|gif|png) [--step N] [--at SEC] [--fps 15] [--scale 2] [--dark] [--theme NAME]');
  process.exit(1);
}
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (kind !== 'png') {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    fail('ffmpeg is needed for MP4 and GIF: https://ffmpeg.org/download.html (macOS: brew install ffmpeg). PNG works without it.');
  }
}

const spec = readSpec(input);
const { toSvg, timeline } = await lib('svg');
const props = mapGraphs(structuredClone(spec.props), (g) => ({ props: g }));
const svg = toSvg(props, { preset: opt.theme, theme: opt.accent ? { accent: opt.accent } : undefined, title: spec.title });
const W = Math.ceil(Number(svg.match(/width="([\d.]+)"/)[1]));
const H = Math.ceil(Number(svg.match(/height="([\d.]+)"/)[1]));
const { segs, total } = timeline(props);

let from = 0,
  to = total;
const stepNo = opt.step ?? (kind === 'png' && opt.at == null ? '1' : undefined);
if (stepNo != null) {
  const own = segs.filter((s) => s.si === Number(stepNo) - 1);
  if (!own.length) fail(`--step ${stepNo}: the spec has ${new Set(segs.map((s) => s.si)).size} steps`);
  from = own[0].t0;
  to = own.at(-1).t1;
}
const fps = Number(opt.fps);
const scale = Number(opt.scale ?? (kind === 'gif' ? 1 : 2));

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const known = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  for (const p of known) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {}
  }
  fail('No Chrome or Chromium found. Install one, or set CHROME_PATH to its executable.');
}

const dir = mkdtempSync(join(tmpdir(), 'traceframe-'));
const chrome = spawn(
  findChrome(),
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--remote-debugging-port=0', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let ws;
try {
  writeFileSync(join(dir, 'figure.svg'), svg);
  const endpoint = await new Promise((resolve, reject) => {
    let buf = '';
    chrome.stderr.on('data', (d) => {
      const m = (buf += d).match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    chrome.on('exit', (code) => reject(new Error(`Chrome exited (${code}) before it was ready`)));
    setTimeout(() => reject(new Error('Chrome did not start within 20 s')), 20000);
  });
  const targets = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json();
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const run = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true });

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: opt.dark ? 'dark' : 'light' }] });
  await send('Page.navigate', { url: pathToFileURL(join(dir, 'figure.svg')).href });
  await run(`new Promise((r) => { const ok = () => document.readyState === 'complete' ? r() : setTimeout(ok, 20); ok(); })`);

  // CSS keyframes and SMIL motion both follow this one clock.
  const frame = async (t, file) => {
    await run(`(() => { const s = document.documentElement; s.pauseAnimations(); s.setCurrentTime(${t});
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${t * 1000}; }
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(data, 'base64'));
  };

  if (kind === 'png') {
    await frame(opt.at != null ? Number(opt.at) : to - 0.05, out);
  } else {
    const frames = join(dir, 'frames');
    mkdirSync(frames);
    const n = Math.max(1, Math.ceil((to - from) * fps));
    for (let i = 0; i < n; i++) {
      await frame(from + i / fps, join(frames, `${String(i).padStart(5, '0')}.png`));
      if (i % fps === 0) process.stderr.write(`\rframe ${i + 1}/${n}`);
    }
    process.stderr.write(`\rframe ${n}/${n}\n`);
    const common = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%05d.png')];
    const args =
      kind === 'gif'
        ? [...common, '-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5', '-loop', '0', out]
        : [...common, '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out];
    execFileSync('ffmpeg', args, { stdio: 'inherit' });
  }
  console.log(`${out} — ${W * scale}×${H * scale}${kind === 'png' ? '' : `, ${(to - from).toFixed(1)} s`}`);
} finally {
  ws?.close();
  if (chrome.exitCode == null) {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await exited;
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
