#!/usr/bin/env node
/* Structurizr helper for MORE THAN ENOUGH — validate workspace.dsl and export
 * its views as Mermaid (or PlantUML / workspace JSON).
 *
 * ENGINE — local first:
 *   - Primary: the official Structurizr CLI via Docker
 *       docker run --rm -v <repo>:/usr/local/structurizr structurizr/structurizr ...
 *     Requires the Docker daemon and a one-time `docker pull structurizr/structurizr`.
 *     Produces byte-identical Mermaid output to the public MCP server (both wrap
 *     the same structurizr-export library) — no network calls, works offline.
 *   - Fallback: the official public Structurizr MCP server
 *     (https://mcp.structurizr.com/mcp), used only when Docker is unavailable.
 *   Force an engine with STRUCTURIZR_ENGINE=docker|mcp.
 *
 * Usage (run from anywhere; the repo is located relative to this script):
 *   node structurizr/scripts/structurizr.mjs validate [dsl]
 *   node structurizr/scripts/structurizr.mjs list    [dsl]
 *   node structurizr/scripts/structurizr.mjs json    [dsl]            # writes structurizr/workspace.json (not committed)
 *   node structurizr/scripts/structurizr.mjs mermaid [viewKey] [dsl]  # exports all views to structurizr/diagrams/*.mmd
 *   node structurizr/scripts/structurizr.mjs plantuml [viewKey] [dsl] # exports all views to structurizr/diagrams/*.puml
 *
 * Examples:
 *   node structurizr/scripts/structurizr.mjs validate
 *   node structurizr/scripts/structurizr.mjs mermaid
 *   node structurizr/scripts/structurizr.mjs mermaid GameLoop
 *
 * structurizr/workspace.dsl is the single source of truth. The generated
 * diagrams under structurizr/diagrams/ are committed so agents and humans can
 * read them without any tooling; re-export them whenever the DSL changes.
 */
'use strict';

import {
  readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, readdirSync,
  existsSync, mkdtempSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // structurizr/
const REPO = path.resolve(ROOT, '..');                                        // repo root (mounted into the container)
const DEFAULT_DSL = path.join(ROOT, 'workspace.dsl');
const OUT_DIR = path.join(ROOT, 'diagrams');
const IMAGE = 'structurizr/structurizr';
const ENDPOINT = 'https://mcp.structurizr.com/mcp';

function header(cmd) {
  return cmd === 'mermaid'
    ? '%% Generated from structurizr/workspace.dsl — do not edit; run: node structurizr/scripts/structurizr.mjs mermaid\n'
    : "' Generated from structurizr/workspace.dsl - do not edit; run: node structurizr/scripts/structurizr.mjs plantuml\n";
}

const EXT = { mermaid: 'mmd', plantuml: 'puml' };

/* ------------------------------------------------ docker engine */

function dockerAvailable() {
  const r = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'],
    { encoding: 'utf8', timeout: 20000 });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function dockerRun(args, extraMounts = []) {
  const mounts = [`${REPO}:/usr/local/structurizr`, ...extraMounts];
  const full = ['run', '--rm'];
  for (const m of mounts) full.push('-v', m);
  full.push(IMAGE, ...args);
  return spawnSync('docker', full, { encoding: 'utf8', timeout: 300000, maxBuffer: 128 * 1024 * 1024 });
}

/* ------------------------------------------------ mcp fallback */

async function rpc(method, params) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error('MCP error: ' + JSON.stringify(data.error));
  return data.result;
}

function textOf(result) {
  const content = result && result.content;
  if (Array.isArray(content)) return content.map((c) => c.text || '').join('\n');
  return JSON.stringify(result, null, 2);
}

function viewKeys(workspace) {
  const vs = workspace && workspace.views || {};
  const groups = [
    vs.systemContextViews || [], vs.containerViews || [], vs.componentViews || [],
    vs.dynamicViews || [], vs.deploymentViews || []
  ];
  return groups.flat().map((v) => v.key).filter(Boolean);
}

/* ------------------------------------------------ orchestration */

function parseArgs(a1, a2) {
  // positional tolerance: [viewKey] [dsl] or [dsl] [viewKey]
  if (a1.endsWith('.dsl')) return { dslArg: a1, viewArg: a2 };
  if (a2.endsWith('.dsl')) return { dslArg: a2, viewArg: a1 };
  return { viewArg: a1, dslArg: a2 };
}

async function keysFromDocker(dslRel) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'stz-json-'));
  const r = dockerRun(['export', '-workspace', dslRel, '-format', 'json', '-output', '/stz'],
    [`${tmp}:/stz`]);
  if (r.status !== 0 || !existsSync(path.join(tmp, 'workspace.json'))) {
    throw new Error('docker json export failed:\n' + (r.stderr || r.stdout));
  }
  const ws = JSON.parse(readFileSync(path.join(tmp, 'workspace.json'), 'utf8'));
  rmSync(tmp, { recursive: true, force: true });
  return viewKeys(ws);
}

async function exportViaDocker(cmd, dslRel, viewArg) {
  const ext = EXT[cmd];
  const keys = await keysFromDocker(dslRel);
  if (!keys.length) { console.log('no views found'); process.exit(1); }
  if (viewArg && !keys.includes(viewArg)) {
    console.error('unknown view "' + viewArg + '" — available: ' + keys.join(', '));
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const r = dockerRun(['export', '-workspace', dslRel, '-format',
    cmd === 'mermaid' ? 'mermaid' : 'plantuml', '-output', 'structurizr/diagrams']);
  if (r.status !== 0) {
    throw new Error('docker export failed:\n' + (r.stderr || r.stdout));
  }

  // The CLI writes one file per view named "<something>-<viewKey>.<ext>".
  // Normalise to "<viewKey>.<ext>" using the keys from the JSON export, add the
  // generation header, and drop files for views that no longer exist.
  const written = [];
  for (const file of readdirSync(OUT_DIR)) {
    const abs = path.join(OUT_DIR, file);
    if (path.extname(file) !== '.' + ext || !path.basename(file, '.' + ext)) continue;
    const match = file.match(new RegExp('^(.+)-([A-Za-z0-9_-]+)\\.' + ext + '$'));
    if (!match || !keys.includes(match[2])) continue; // not a docker-generated view file
    const target = path.join(OUT_DIR, match[2] + '.' + ext);
    if (abs !== target) renameSync(abs, target);
    let body = readFileSync(target, 'utf8');
    const h = header(cmd);
    if (!body.startsWith(h)) body = h + body;
    writeFileSync(target, body.trimEnd() + '\n');
    written.push(match[2]);
  }
  for (const file of readdirSync(OUT_DIR)) {
    if (path.extname(file) !== '.' + ext) continue;
    const base = path.basename(file, '.' + ext);
    if (!keys.includes(base)) { rmSync(path.join(OUT_DIR, file)); console.log('removed stale ' + file); }
  }

  if (viewArg) {
    console.log('wrote ' + path.join(OUT_DIR, viewArg + '.' + ext));
  } else if (written.length) {
    for (const k of written) console.log('wrote ' + path.join(OUT_DIR, k + '.' + ext));
  } else {
    console.log('nothing exported (no views)…');
  }
}

async function exportViaMCP(cmd, dsl, viewArg) {
  const ws = JSON.parse(textOf(await rpc('tools/call', { name: 'parse', arguments: { dsl } })));
  const keys = viewKeys(ws);
  const wanted = viewArg ? [viewArg] : keys;
  if (!wanted.length) { console.log('no views found'); process.exit(1); }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const key of wanted) {
    const name = cmd === 'mermaid' ? 'export-mermaid' : 'export-plantuml';
    const out = textOf(await rpc('tools/call', { name, arguments: { dsl, viewKey: key } }));
    let definition = out;
    try {
      const envelope = JSON.parse(out);
      if (typeof envelope.definition === 'string') definition = envelope.definition;
    } catch (_) { /* plain text export */ }
    const ext = EXT[cmd];
    const file = path.join(OUT_DIR, key + '.' + ext);
    writeFileSync(file, header(cmd) + definition.trimEnd() + '\n');
    console.log('wrote ' + file);
  }
}

async function main() {
  const [, , cmd, a1 = '', a2 = ''] = process.argv;
  if (!cmd) {
    console.log('usage: see the header of this script');
    console.log('  validate | list | json | mermaid [viewKey] | plantuml [viewKey]');
    process.exit(1);
  }

  const { dslArg, viewArg } = parseArgs(a1, a2);
  const dslPath = dslArg ? path.resolve(dslArg) : DEFAULT_DSL;
  if (!existsSync(dslPath)) { console.error('DSL not found: ' + dslPath); process.exit(1); }
  const dslRel = path.relative(REPO, dslPath);
  if (dslRel.startsWith('..')) {
    console.error('the DSL must live inside the repo for the Docker engine: ' + dslPath);
    process.exit(1);
  }
  const dsl = readFileSync(dslPath, 'utf8');

  const force = process.env.STRUCTURIZR_ENGINE;
  const engine = force || (dockerAvailable() ? 'docker' : 'mcp');
  if (engine === 'mcp' && !force) {
    console.warn('note: Docker daemon not available — using the public Structurizr MCP server');
    console.warn('      (install Docker, or set STRUCTURIZR_ENGINE=mcp/docker explicitly)');
  }

  if (cmd === 'validate') {
    if (engine === 'docker') {
      const r = dockerRun(['validate', '-workspace', dslRel]);
      const out = (r.stdout || '') + (r.stderr || '');
      if (/ERROR|Exception|Unexpected tokens|Unable to/i.test(out)) {
        console.error(out.trim());
        process.exit(1);
      }
      console.log('OK: ' + dslRel + ' is valid Structurizr DSL (official CLI, via Docker)');
      return;
    }
    const out = textOf(await rpc('tools/call', { name: 'validate', arguments: { dsl } }));
    console.log(out);
    process.exit(out.indexOf('OK') !== -1 ? 0 : 1);
  }

  if (cmd === 'list') {
    if (engine === 'docker') {
      const r = dockerRun(['list', '-workspace', dslRel]);
      if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
      console.log(r.stdout.trimEnd());
      return;
    }
    const ws = JSON.parse(textOf(await rpc('tools/call', { name: 'parse', arguments: { dsl } })));
    console.log(viewKeys(ws).join('\n'));
    return;
  }

  if (cmd === 'json') {
    if (engine === 'docker') {
      const r = dockerRun(['export', '-workspace', dslRel, '-format', 'json', '-output', 'structurizr']);
      if (r.status !== 0 || !existsSync(path.join(ROOT, 'workspace.json'))) {
        console.error(r.stderr || r.stdout || 'json export failed');
        process.exit(1);
      }
      console.log('wrote ' + path.join(ROOT, 'workspace.json') + ' (not committed; regenerate on demand)');
      return;
    }
    const ws = JSON.parse(textOf(await rpc('tools/call', { name: 'parse', arguments: { dsl } })));
    writeFileSync(path.join(ROOT, 'workspace.json'), JSON.stringify(ws, null, 2));
    console.log('wrote ' + path.join(ROOT, 'workspace.json'));
    return;
  }

  if (cmd === 'mermaid' || cmd === 'plantuml') {
    if (engine === 'docker') return exportViaDocker(cmd, dslRel, viewArg);
    return exportViaMCP(cmd, dsl, viewArg);
  }

  console.error('unknown command: ' + cmd);
  process.exit(1);
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(2); });