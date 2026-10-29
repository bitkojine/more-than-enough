/* Fast static evidence, independent of gameplay tests. Report existing debt
 * honestly; do not present a noisy legacy baseline as a clean quality gate. */
import { ESLint } from 'eslint';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputArg = process.argv.indexOf('--output');
const output = outputArg < 0 ? null : process.argv[outputArg + 1];
if (outputArg >= 0 && !output) throw new Error('--output needs a directory');
const engine = new ESLint();
const results = await engine.lintFiles(['src/**/*.js', 'server/src/**/*.js', 'wiki/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js']);
const diagnostics = results.flatMap(file => file.messages.map(m => ({ file: path.relative(process.cwd(), file.filePath), ...m })));
const rules = new Map();
for (const m of diagnostics) rules.set(m.ruleId || 'parse-error', (rules.get(m.ruleId || 'parse-error') || 0) + 1);
const hotspots = results.map(file => {
  const messages = file.messages;
  return { file: path.relative(process.cwd(), file.filePath), errors: messages.filter(m => m.severity === 2).length,
    warnings: messages.filter(m => m.severity === 1).length,
    complexity: messages.filter(m => ['complexity', 'max-depth', 'max-params', 'max-lines-per-function'].includes(m.ruleId)).length };
}).filter(f => f.errors || f.warnings).sort((a,b) => b.errors-a.errors || b.complexity-a.complexity || b.warnings-a.warnings || a.file.localeCompare(b.file));
const fatal = diagnostics.filter(m => m.fatal).length;
const functions = diagnostics.filter(m => m.ruleId === 'complexity').sort((a,b) => Number(b.message.match(/complexity of (\d+)/)?.[1] || 0)-Number(a.message.match(/complexity of (\d+)/)?.[1] || 0));
const lines = [
  `Static analysis: ${results.length} files, ${diagnostics.filter(m => m.severity === 2).length} errors, ${diagnostics.filter(m => m.severity === 1).length} warnings (${fatal} parse failures).`,
  'Existing debt report; only parse failures fail this command. No claim of lint-clean code.',
  '\nRules (count):', ...[...rules].sort((a,b) => b[1]-a[1]).map(([rule,count]) => `  ${rule}: ${count}`),
  '\nFiles to inspect first (errors, complexity/size findings, warnings):',
  ...hotspots.slice(0,20).map(f => `  ${f.file}: ${f.errors}, ${f.complexity}, ${f.warnings}`),
  '\nHighest cyclomatic complexity (independent paths through a function):',
  ...functions.slice(0,15).map(m => `  ${m.file}:${m.line}:${m.column} ${m.message}`),
  '\nDiagnostics (file:line:column):',
  ...diagnostics.map(m => `${m.file}:${m.line || 1}:${m.column || 1} ${m.severity === 2 ? 'error' : 'warning'} ${m.ruleId || 'parse-error'} ${m.message}`)
];
const report = lines.join('\n')+'\n';
console.log(lines.slice(0,lines.indexOf('\nDiagnostics (file:line:column):')).join('\n'));
if (output) {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output,'analysis.txt'), report);
  await writeFile(path.join(output,'analysis.json'), JSON.stringify({ files: results.length, fatal, rules: Object.fromEntries(rules), hotspots, diagnostics }, null, 2)+'\n');
  console.log(`\nFull diagnostics: ${output}/analysis.txt and analysis.json`);
} else console.log('\nUse --output <directory> for all diagnostic locations and machine-readable results.');
if (fatal) process.exitCode = 1;
