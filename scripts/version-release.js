const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(version || '')) {
  throw new Error('Use a version such as 0.3.1 or 0.3.1-beta.1.');
}
const packageFile = path.join(root, 'package.json');
const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
if (version === metadata.version) throw new Error('Version is already set.');
metadata.version = version;
metadata.androidVersionCode += 1;
if (!Number.isSafeInteger(metadata.androidVersionCode)) {
  throw new Error('androidVersionCode must be an integer.');
}
const lockFile = path.join(root, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
lock.version = version;
lock.packages[''].version = version;
fs.writeFileSync(packageFile, JSON.stringify(metadata, null, 2) + '\n');
fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
console.log(
  `Version ${version}; Android version code ${metadata.androidVersionCode}.`,
);
