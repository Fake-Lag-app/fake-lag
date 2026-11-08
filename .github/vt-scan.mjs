// After a release: scan the installer on VirusTotal and, when no engine flags it, record it in docs/vt.json
// so the landing page can say "scanned on VirusTotal, nothing found". Never fails the release.
// usage: node .github/vt-scan.mjs <installer> <tag> <docs/vt.json>
import fs from 'node:fs';
import crypto from 'node:crypto';

const [file, tag, out] = process.argv.slice(2);
const KEY = process.env.VT_API_KEY;
const API = process.env.VT_API_BASE || 'https://www.virustotal.com/api/v3';   // VT_API_BASE: only for testing with a fake server
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (kind, msg) => console.log(`::${kind}::${msg}`);

if (!KEY) { say('notice', 'VT_API_KEY is not set: skipping the VirusTotal scan'); process.exit(0); }

async function vt(path, opts = {}) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(path.startsWith('http') ? path : API + path, { ...opts, headers: { 'x-apikey': KEY, ...(opts.headers || {}) } });
    if (r.status === 429) { await sleep(65000); continue; }          // free key: 4 requests a minute
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  }
  throw new Error('VirusTotal kept saying "too many requests"');
}

const counted = s => (s.malicious || 0) + (s.suspicious || 0) + (s.undetected || 0) + (s.harmless || 0);

async function main() {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  console.log('installer sha256', sha);

  // already scanned (same file)? use that report
  let stats = null;
  const known = await vt(`/files/${sha}`);
  const ks = known.j?.data?.attributes?.last_analysis_stats;
  if (known.status === 200 && ks && counted(ks) > 0) stats = ks;

  if (!stats) {
    // the installer is ~100MB, above the plain upload limit (32MB): ask for a one-time upload address first
    const u = await vt('/files/upload_url');
    if (!u.j?.data) throw new Error('no upload address: ' + JSON.stringify(u.j).slice(0, 200));
    const form = new FormData();
    form.append('file', await fs.openAsBlob(file), 'FakeLag-Setup.exe');
    const up = await vt(u.j.data, { method: 'POST', body: form });
    const id = up.j?.data?.id;
    if (!id) throw new Error('upload refused: ' + JSON.stringify(up.j).slice(0, 200));
    console.log('uploaded, analysis', id);
    for (let i = 0; i < 60 && !stats; i++) {          // up to ~30 minutes
      await sleep(Number(process.env.VT_POLL_MS) || 30000);
      const a = await vt(`/analyses/${id}`);
      if (a.j?.data?.attributes?.status === 'completed') stats = a.j.data.attributes.stats;
    }
    if (!stats) { say('warning', 'VirusTotal did not finish in 30 minutes; the page will not show the scan line for ' + tag); return; }
  }

  console.log('stats', JSON.stringify(stats));
  if (stats.malicious || stats.suspicious) {
    say('warning', `VirusTotal: ${stats.malicious} malicious, ${stats.suspicious} suspicious for ${tag}. Not added to docs/vt.json. https://www.virustotal.com/gui/file/${sha}`);
    return;
  }
  const db = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { files: {} };
  db.files[sha] = { tag, engines: counted(stats), at: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(out, JSON.stringify(db, null, 2) + '\n');
  say('notice', `VirusTotal: clean (0 of ${counted(stats)}). Recorded in ${out}`);
}

main().catch(e => { say('warning', 'VirusTotal scan failed: ' + e.message); });
