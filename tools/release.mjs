// Usage: node tools/release.mjs <patch|minor|major|x.y.z> "What changed, one line"
// Bumps app/package.json, writes app/manifest.json with sha256 of every app file.
// Then commit and push to main: installed apps pick it up within ~4 hours (or on "Check for updates").
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const [bump = 'patch', notes = ''] = process.argv.slice(2);
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let [a, b, c] = pkg.version.split('.').map(Number);
if (/^\d+\.\d+\.\d+$/.test(bump)) [a, b, c] = bump.split('.').map(Number);
else if (bump === 'major') { a++; b = 0; c = 0; }
else if (bump === 'minor') { b++; c = 0; }
else c++;
pkg.version = `${a}.${b}.${c}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const files = {};
for (const f of fs.readdirSync(root).sort()) {
  if (f === 'manifest.json' || !/^[A-Za-z0-9._-]+$/.test(f)) continue;
  const full = path.join(root, f);
  if (!fs.statSync(full).isFile()) continue;
  files[f] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}
const manifest = { version: pkg.version, notes, released: new Date().toISOString(), files };
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Release ${pkg.version} prepared (${Object.keys(files).length} files). Now: git add -A && git commit -m "Release ${pkg.version}" && git push`);
