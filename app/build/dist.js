// Builds the Windows installer in three steps:
// 1. pack the app folder, 2. stamp the icon and version info into Fake Lag.exe,
// 3. wrap that folder in the NSIS installer.
// Step 2 is done here because electron-builder's own exe editing needs a download
// that fails without admin rights on Windows.
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const builder = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const rcedit = path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
const unpacked = path.join(root, 'dist', 'win-unpacked');
const exe = path.join(unpacked, `${pkg.productName}.exe`);

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: cmd.endsWith('.cmd') });

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
run(builder, ['--win', 'dir']);
run(rcedit, [exe,
  '--set-icon', path.join(__dirname, 'icon.ico'),
  '--set-file-version', pkg.version, '--set-product-version', pkg.version,
  '--set-version-string', 'ProductName', pkg.productName,
  '--set-version-string', 'FileDescription', pkg.productName,
  '--set-version-string', 'CompanyName', pkg.author,
  '--set-version-string', 'LegalCopyright', pkg.build.copyright,
  '--set-version-string', 'OriginalFilename', `${pkg.productName}.exe`]);
run(builder, ['--win', 'nsis', '--prepackaged', unpacked]);
console.log('\ninstaller:', path.join(root, 'dist', pkg.build.nsis.artifactName.replace('${version}', pkg.version)));
