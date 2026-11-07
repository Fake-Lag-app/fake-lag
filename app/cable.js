// VB-Cable in one click: download the official pack from vb-audio.com, check that the installer is really
// signed by its author, and run it. Windows asks the user to approve (it installs a sound driver).
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PACK_URL = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';
const SIGNER = 'BUREL VINCENT';      // the author's code-signing certificate
const MAX_BYTES = 20 * 1024 * 1024;

const ps = (script, timeout = 60000) => new Promise(res => execFile('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
  { windowsHide: true, timeout }, (err, out, errOut) => res({ code: err ? 1 : 0, out: String(out || '').trim(), err: String(errOut || '').trim() })));
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

async function install(log = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakelag-vbcable-'));
  try {
    const r = await fetch(PACK_URL, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) return { ok: false, error: 'download' };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100000 || buf.length > MAX_BYTES) return { ok: false, error: 'download' };
    const zip = path.join(dir, 'pack.zip'), out = path.join(dir, 'x');
    fs.writeFileSync(zip, buf);
    const x = await ps(`Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(out)} -Force`);
    if (x.code) { log('cable unzip ' + x.err); return { ok: false, error: 'unzip' }; }
    const exe = path.join(out, process.arch === 'ia32' ? 'VBCABLE_Setup.exe' : 'VBCABLE_Setup_x64.exe');
    if (!fs.existsSync(exe)) return { ok: false, error: 'unzip' };
    const sig = await ps(`$s = Get-AuthenticodeSignature -LiteralPath ${q(exe)}; "$($s.Status)|$($s.SignerCertificate.Subject)"`);
    const [status, subject = ''] = sig.out.split('|');
    if (status !== 'Valid' || !subject.includes(SIGNER)) { log('cable signature ' + sig.out); return { ok: false, error: 'signature' }; }
    // the installer opens with an "Install Driver" button; Windows asks for permission first
    const run = await ps(`try { $p = Start-Process -FilePath ${q(exe)} -WorkingDirectory ${q(out)} -Verb RunAs -PassThru -Wait; "ok" } catch { "cancelled" }`, 15 * 60 * 1000);
    if (run.out !== 'ok') return { ok: false, error: 'cancelled' };
    return { ok: true };
  } catch (e) {
    log('cable ' + e.message);
    return { ok: false, error: 'download' };
  } finally {
    setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 5000);
  }
}

module.exports = { install };
