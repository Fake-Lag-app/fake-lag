// Everything the app needs, installed in one go: OBS and VB-Cable.
// Downloads come from the official sources only; each installer is checked to be signed by its maker
// right before it runs; both run in one elevated step, so Windows asks for permission once.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OBS_API = 'https://api.github.com/repos/obsproject/obs-studio/releases/latest';
const OBS_FALLBACK = 'https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-Windows-x64-Installer.exe';
const CABLE_URL = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';
const SIGNERS = { obs: 'OBS Project, LLC', cable: 'BUREL VINCENT' };

const ps = (script, timeout = 120000) => new Promise(res => execFile('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
  { windowsHide: true, timeout }, (err, out, errOut) => res({ code: err ? 1 : 0, out: String(out || '').trim(), err: String(errOut || '').trim() })));
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

async function download(url, file, onPct, maxBytes) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20 * 60 * 1000), headers: { 'user-agent': 'FakeLag' } });
  if (!r.ok || !r.body) throw new Error('download ' + r.status);
  const total = Number(r.headers.get('content-length')) || 0;
  if (total && total > maxBytes) throw new Error('too big');
  const out = fs.createWriteStream(file);
  let got = 0, lastPct = -1;
  for await (const chunk of r.body) {
    got += chunk.length;
    if (got > maxBytes) { out.destroy(); throw new Error('too big'); }
    if (!out.write(chunk)) await new Promise(ok => out.once('drain', ok));
    const pct = total ? Math.floor(got / total * 100) : 0;
    if (pct !== lastPct) { lastPct = pct; onPct(pct); }
  }
  await new Promise((ok, bad) => out.end(err => err ? bad(err) : ok()));
  return got;
}
async function obsInstallerUrl() {
  try {
    const r = await fetch(OBS_API, { headers: { 'user-agent': 'FakeLag', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
    const rel = await r.json();
    const a = (rel.assets || []).find(x => /Windows-x64-Installer\.exe$/i.test(x.name) || /Full-Installer-x64\.exe$/i.test(x.name));
    if (a && /^https:\/\/github\.com\/obsproject\/obs-studio\/releases\/download\//.test(a.browser_download_url)) return a.browser_download_url;
  } catch {}
  return OBS_FALLBACK;
}

// the part that runs as admin: copy each installer where normal programs can't change it, check the signature, run it quietly
const ELEVATED = `
param([string]$obs, [string]$cable, [string]$status, [string]$dry = 'no')
$ErrorActionPreference = 'Stop'
function Say($m) { Add-Content -LiteralPath $status -Value $m -Encoding UTF8 }
$safe = Join-Path (Join-Path $env:windir 'Temp') ('fakelag-' + [guid]::NewGuid())
# copy the installer (and for VB-Cable the whole folder it needs), check who signed it, run it quietly
function Run([string]$file, [string]$signer, [string[]]$flags, [string]$label, [bool]$folder) {
  $to = Join-Path $safe $label
  if ($folder) { Copy-Item -LiteralPath (Split-Path $file) -Destination $to -Recurse } else { New-Item -ItemType Directory -Path $to | Out-Null; Copy-Item -LiteralPath $file -Destination $to }
  $copy = Join-Path $to (Split-Path $file -Leaf)
  $s = Get-AuthenticodeSignature -LiteralPath $copy
  if ($s.Status -ne 'Valid' -or -not $s.SignerCertificate.Subject.Contains($signer)) { Say ($label + ':signature'); exit 3 }
  if ($dry -eq 'yes') { Say ($label + ':verified'); return }
  Say ($label + ':running')
  $p = Start-Process -FilePath $copy -ArgumentList $flags -WorkingDirectory $to -PassThru -Wait
  Say ($label + ':exit:' + $p.ExitCode)
}
try {
  New-Item -ItemType Directory -Path $safe | Out-Null
  if ($obs -ne 'none') { Run $obs '${SIGNERS.obs}' @('/S') 'obs' $false }
  if ($cable -ne 'none') { Run $cable '${SIGNERS.cable}' @('-i', '-h') 'cable' $true }
  Say 'done'
} catch { Say ('error:' + $_.Exception.Message) } finally { Remove-Item -LiteralPath $safe -Recurse -Force -ErrorAction SilentlyContinue }
`;

async function installAll({ obs = true, cable = true, dry = false, onProgress = () => {}, log = () => {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakelag-deps-'));
  const result = { ok: false, obs: obs ? 'todo' : 'skip', cable: cable ? 'todo' : 'skip', error: '' };
  try {
    let obsFile = '', cableFile = '';
    if (obs) {
      onProgress({ step: 'download-obs', pct: 0 });
      obsFile = path.join(dir, 'OBS-Setup.exe');
      await download(await obsInstallerUrl(), obsFile, pct => onProgress({ step: 'download-obs', pct }), 400 * 1024 * 1024);
    }
    if (cable) {
      onProgress({ step: 'download-cable', pct: 0 });
      const zip = path.join(dir, 'vbcable.zip');
      await download(CABLE_URL, zip, pct => onProgress({ step: 'download-cable', pct }), 20 * 1024 * 1024);
      const x = await ps(`Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(path.join(dir, 'cable', 'x'))} -Force`);
      if (x.code) throw new Error('unzip');
      cableFile = path.join(dir, 'cable', 'x', process.arch === 'ia32' ? 'VBCABLE_Setup.exe' : 'VBCABLE_Setup_x64.exe');
      if (!fs.existsSync(cableFile)) throw new Error('unzip');
    }
    // one permission prompt for both
    onProgress({ step: 'install', pct: 0 });
    const script = path.join(dir, 'install.ps1'), status = path.join(dir, 'status.txt');
    fs.writeFileSync(script, '\uFEFF' + ELEVATED, 'utf8');
    // one string, every path in double quotes (Start-Process does not quote array items)
    const dq = v => '"' + String(v).replace(/"/g, '') + '"';
    const argLine = `-NoProfile -ExecutionPolicy Bypass -File ${dq(script)} -obs ${dq(obsFile || 'none')} -cable ${dq(cableFile || 'none')} -status ${dq(status)} -dry ${dry ? 'yes' : 'no'}`;
    const readLines = () => { try { return fs.readFileSync(status, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean); } catch { return []; } };
    const lastLine = () => readLines().pop() || '';
    const poll = setInterval(() => { const s = lastLine(); if (s) onProgress({ step: 'install', status: s }); }, 700);
    const run = await ps(`try { Start-Process powershell.exe ${dry ? '' : '-Verb RunAs'} -WindowStyle Hidden -Wait -ArgumentList ${q(argLine)}; 'ok' } catch { 'cancelled' }`, 30 * 60 * 1000);
    clearInterval(poll);
    if (run.out !== 'ok') { result.error = 'cancelled'; return result; }
    const lines = readLines();
    log('deps status ' + lines.join(' | '));
    for (const k of ['obs', 'cable']) { const l = lines.filter(x => x.startsWith(k + ':')).pop(); if (l) result[k] = l.slice(k.length + 1); }
    if (lines.some(x => x.startsWith('error:') || x.endsWith(':signature'))) { result.error = lines.some(x => x.endsWith(':signature')) ? 'signature' : 'install'; return result; }
    // an installer that ran but returned an error code did not install (0 = ok, 3010/1641 = ok but wants a restart)
    const failed = k => { const m = /^exit:(-?\d+)$/.exec(result[k]); return m && !['0', '3010', '1641'].includes(m[1]); };
    const bad = ['obs', 'cable'].filter(failed);
    if (bad.length) { result.error = 'install'; result.failed = bad; return result; }
    result.ok = lines.includes('done');
    return result;
  } catch (e) {
    log('deps ' + e.message);
    result.error = /download|too big|fetch|abort/i.test(e.message) ? 'download' : e.message === 'unzip' ? 'unzip' : 'install';
    return result;
  } finally {
    setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 10000);
  }
}

module.exports = { installAll };
