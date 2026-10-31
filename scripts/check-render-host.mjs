#!/usr/bin/env node
/* Keep browser failures readable through GitHub's checks API even when log
 * and artifact downloads are unavailable. Each suite stays a separate host. */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const modes = [
  'ILLUMINATION',
  'LAYER',
  'RENDER_PERF',
  'HUD',
  'PERF',
  'FULLSCREEN',
  'PROGRESSION',
  'LAB_PACING'
];
const outputDir = process.env.MTE_SHOT_DIR || path.resolve('render-checks');
mkdirSync(outputDir, { recursive: true });
for (const mode of modes) {
  console.log(`::group::Browser ${mode}`);
  let tail = '',
    partial = '';
  const failures = [];
  const child = spawn(process.execPath, ['test/browser.e2e.js'], {
    env: { ...process.env, MTE_SHOT_DIR: outputDir, ['MTE_' + mode + '_ONLY']: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const capture = (stream, chunk) => {
    const text = chunk.toString();
    stream.write(text);
    tail = (tail + text).slice(-12000);
    const lines = (partial + text).split(/\r?\n/);
    partial = lines.pop();
    for (const line of lines)
      if (
        /FAIL:|E2E ERROR:|Chrome (?:did not|exited)|(?:Type|Syntax|Reference)?Error:/.test(line)
      ) {
        failures.push(line.slice(0, 600));
        if (failures.length > 20) failures.shift();
      }
  };
  child.stdout.on('data', (chunk) => capture(process.stdout, chunk));
  child.stderr.on('data', (chunk) => capture(process.stderr, chunk));
  const result = await new Promise((resolve) => {
    child.on('error', (error) => {
      tail += '\n' + error.stack;
      resolve(2);
    });
    child.on('close', (code) => resolve(code ?? 2));
  });
  writeFileSync(path.join(outputDir, mode.toLowerCase() + '-host.log'), tail);
  console.log('::endgroup::');
  if (result !== 0) {
    const detail = failures.join('\n') + '\n' + tail.slice(-4000);
    const escaped = detail.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Browser ${mode} failed::${escaped}`);
    process.exit(result);
  }
}
