import { rm, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const files = ['plan-workflow.js','plan-workflow.css','index.html', 'phone.html', 'live.html', 'live.css', 'live.js', 'workspace.css', 'workspace.js', 'luopan.js', 'assets/zodiac.png', '_headers', '_routes.json', '_redirects', 'login.html', 'login.js', 'admin.html', 'settings.html', 'account.css', 'auth-client.js', 'session.js', 'assets/auth-residential-loop-v2.mp4', 'assets/auth-residential-video-poster-v2.jpg'];
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const script of ['workspace.js', 'luopan.js','live.js','login.js','session.js','auth-client.js','server/auth-core.mjs']) {
  execFileSync(process.execPath, ['--check', join(root, script)]);
}
for (const htmlFile of ['index.html', 'phone.html', 'live.html']) {
  const html = await readFile(join(root, htmlFile), 'utf8');
  if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(html)) throw new Error('Local-only URL in ' + htmlFile);
}
const output = join(root, 'dist');
await rm(output, {recursive:true,force:true});
await mkdir(join(output, 'assets'), { recursive: true });
for (const file of files) await copyFile(join(root, file), join(output, file));
await copyFile(join(root,'login.html'),join(output,'register.html'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await writeFile(join(output, 'version.json'), JSON.stringify({ name: pkg.name, version: pkg.version, channel: 'ui-preview', commit }, null, 2) + '\n');
console.log(`Built ${pkg.name} ${pkg.version}: ${files.length + 2} public files`);

await copyFile(join(root,'assets/admin-invitation-glass.png'),join(output,'assets/admin-invitation-glass.png'));
const { build } = await import('esbuild');
await build({entryPoints:[join(root,'admin-src/main.jsx')],bundle:true,minify:true,format:'esm',jsx:'automatic',outfile:join(output,'assets/admin-app.js')});
