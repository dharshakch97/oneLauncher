const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { version } = require('../package.json');
const directory = path.join(__dirname, '../dist');
const name = `oneLauncher-${version}.apk`;
fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(
  path.join(
    __dirname,
    '../android/app/build/outputs/apk/release/app-release.apk',
  ),
  path.join(directory, name),
);
const hash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(directory, name)))
  .digest('hex');
fs.writeFileSync(path.join(directory, `${name}.sha256`), `${hash}  ${name}\n`);
console.log(`Release files: dist/${name} and dist/${name}.sha256`);
