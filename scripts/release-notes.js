const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
if (
  process.env.GITHUB_REF_NAME &&
  process.env.GITHUB_REF_NAME !== `v${version}`
) {
  throw new Error('Release tag must match package.json version.');
}
const changelog = fs.readFileSync(
  path.join(__dirname, '../CHANGELOG.md'),
  'utf8',
);
const section = changelog.split(`## ${version}\n`)[1];
if (!section) throw new Error(`Missing changelog section for ${version}.`);
console.log(section.split('\n## ')[0].trim());
console.log(
  '\nInstall and recovery: https://github.com/dharshakch97/oneLauncher/blob/main/docs/INSTALLATION.md',
);
