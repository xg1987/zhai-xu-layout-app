import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const files = ['index.html', 'phone.html', 'workspace.css', 'workspace.js', 'luopan.js', 'assets/zodiac.png', '_headers'];
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const script of ['workspace.js', 'luopan.js']) {
  execFileSync(process.execPath, ['--check', join(root, script)]);
}
for (const htmlFile of ['index.html', 'phone.html']) {
  const html = await readFile(join(root, htmlFile), 'utf8');
  if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(html)) throw new Error('Local-only URL in ' + htmlFile);
}
const output = join(root, 'dist');
await mkdir(join(output, 'assets'), { recursive: true });
for (const file of files) await copyFile(join(root, file), join(output, file));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await writeFile(join(output, 'version.json'), JSON.stringify({ name: pkg.name, version: pkg.version, channel: 'ui-preview', commit }, null, 2) + '\n');
console.log(`Built ${pkg.name} ${pkg.version}: ${files.length + 1} public files`);
