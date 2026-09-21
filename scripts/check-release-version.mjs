import fs from 'node:fs';
import assert from 'node:assert/strict';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoLock = fs.readFileSync('src-tauri/Cargo.lock', 'utf8');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
for (const version of [
  lock.version,
  lock.packages[''].version,
  tauri.version,
  cargo.match(/^version = "([^"]+)"/m)?.[1],
  cargoLock.match(/name = "markraft"\r?\nversion = "([^"]+)"/)?.[1],
]) {
  assert.equal(version, pkg.version, 'Release versions must match');
}
console.log(`Release version: ${pkg.version}`);
