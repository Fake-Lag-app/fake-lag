// The control window: remote buttons, settings, setup help, and the first-run wizard.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let S = {}, state = {}, t = k => k, camClosed = false;

const MODES = [
  ['live', '1'], ['lag', '2'], ['low', '3'], ['mosh', '4'], ['freeze', '5'], ['black', '6'],
  ['auto', '0', 'wide danger'], ['reconnect', '9', 'wide'],
];

// ---------- language ----------
function setLang(lang) {
  t = window.T(lang); window.applyI18n(lang);
  $$('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  $('#langSel').value = lang;
  renderModes(); renderKeys(); renderStatus(); renderCable(); renderWizard(); fillDevices();
  refreshRemote();
}
$$('.lang button').forEach(b => b.onclick = () => save({ lang: b.dataset.lang }));
$('#langSel').onchange = e => save({ lang: e.target.value });

// ---------- tabs ----------
function showTab(name) {
  $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('section').forEach(s => s.classList.toggle('on', s.dataset.page === name));
}
$$('nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
window.fl.onSelftestTab(showTab);

// ---------- remote ----------
function renderModes() {
  $('#modes').innerHTML = MODES.map(([m, k, cls = '']) =>
    `<button class="mode ${cls}" data-m="${m}"><kbd>Ctrl+Alt+Shift+${k}</kbd><b>${t('m_' + m)}</b><small>${t('d_' + m)}</small></button>`).join('');
  $$('.mode').forEach(b => b.onclick = () => window.fl.cmd({ t: 'mode', mode: b.dataset.m }));
  markMode();
}
function markMode() { $$('.mode').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode)); }
function renderKeys() {
  $('#keys').innerHTML = MODES.map(([m, k]) => `<kbd>Ctrl+Alt+Shift+${k}</kbd><span>${t('m_' + m)}</span>`).join('')
    + `<kbd>Ctrl+Alt+Shift+↑ / ↓</kbd><span>${t('level')}</span>`;
}
function renderStatus() {
  const rows = [];
  if (camClosed) rows.push(`<span class="bad">${t('st_cam_closed')}</span>`);
  else rows.push(state.camOk ? `<span class="ok">${t('st_cam_ok')}</span>`
    : `<span class="bad">${t(state.camErr === 'busy' ? 'st_cam_busy' : 'st_cam_err')}</span>`);
  rows.push(state.micOk ? `<span class="ok">${t('st_out')} ${esc(state.outName)}</span>` : `<span class="bad">${t('st_out_none')}</span>`);
  if (state.keysFailed && state.keysFailed.length) rows.push(`<span class="bad">${t('st_keys_failed')} ${esc(state.keysFailed.join(', '))}</span>`);
  $('#status').innerHTML = rows.join('');
}
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const lvl = $('#lvl');
lvl.oninput = () => { $('#lvlV').textContent = Math.round(lvl.value * 100) + '%'; window.fl.cmd({ t: 'level', level: +lvl.value }); };
$('#showCam').onclick = () => { camClosed = false; window.fl.showCam(); renderStatus(); };

window.fl.onState(s => {
  state = s; camClosed = false; markMode(); renderStatus();
  if (document.activeElement !== lvl) { lvl.value = s.level; $('#lvlV').textContent = Math.round(s.level * 100) + '%'; }
});
window.fl.onCamClosed(() => { camClosed = true; renderStatus(); });

function showRemote(info) {
  $('#newCode').hidden = !info.qr;
  if (state.remoteFailed) { $('#qr').removeAttribute('src'); $('#phoneHint').textContent = t('r_port'); return; }
  if (info.qr) { $('#qr').src = info.qr; $('#phoneHint').textContent = t('phone_hint'); }
  else $('#phoneHint').textContent = t(navigator.onLine ? 'phone_wait' : 'no_net');
}
async function refreshRemote() { showRemote(await window.fl.remoteInfo()); }
window.fl.onRemoteReady(refreshRemote);
$('#newCode').onclick = async () => showRemote(await window.fl.newRemoteToken());

// ---------- settings ----------
// the language on screen right now, compared to settings no matter which message arrives first
let shownLang = '';
function syncLang() { if (S.lang && S.lang !== shownLang) { shownLang = S.lang; setLang(S.lang); } }
async function save(patch) { S = await window.fl.setSettings(patch); applySettings(); syncLang(); }
window.fl.onSettings(s => { S = s; syncLang(); });
function applySettings() {
  if (document.activeElement !== $('#name')) $('#name').value = S.name || '';
  $('#photoPrev').hidden = !S.photo; if (S.photo) $('#photoPrev').src = S.photo;
  $('#photoClear').hidden = !S.photo;
}
let nameT; $('#name').oninput = e => { clearTimeout(nameT); nameT = setTimeout(() => save({ name: e.target.value.trim() }), 300); };
$('#photo').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    // a 256px square is plenty for the circle and keeps settings small
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const s = Math.max(256 / img.width, 256 / img.height);
    c.getContext('2d').drawImage(img, (256 - img.width * s) / 2, (256 - img.height * s) / 2, img.width * s, img.height * s);
    URL.revokeObjectURL(url); save({ photo: c.toDataURL('image/jpeg', 0.85) });
  };
  img.src = url; e.target.value = '';
};
$('#photoClear').onclick = () => save({ photo: '' });

// ---------- devices ----------
// virtual audio cables: sending the mic anywhere else plays your own voice out of your speakers
const VIRTUAL = /CABLE Input|VB-Audio|Voicemeeter|Virtual/i;
let devices = [];
async function loadDevices() {
  devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.some(d => !d.label)) {
    // labels appear only after access was granted once
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(x => x.stop()); } catch {}
    devices = await navigator.mediaDevices.enumerateDevices();
  }
  const cable = devices.find(d => d.kind === 'audiooutput' && /CABLE Input/i.test(d.label));
  // first run: point the sound at VB-Cable on our own when it is there
  if (!S.setupDone && !S.outId && cable) await save({ outId: cable.deviceId });
  fillDevices(); renderCable();
}
function fillDevices() {
  const opt = (kind, sel, none) => {
    const list = devices.filter(d => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications'
      && !(kind === 'audioinput' && /CABLE Output/i.test(d.label))     // never take our own output as the mic
      && !(kind === 'audiooutput' && !VIRTUAL.test(d.label)));         // sound only to a virtual cable, never to speakers
    const first = none ? `<option value="">${t('s_out_none')}</option>` : `<option value="">${t('s_default')}</option>`;
    return first + list.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === sel ? 'selected' : ''}>${esc(d.label || d.deviceId.slice(0, 8))}</option>`).join('');
  };
  $('#camSel').innerHTML = opt('videoinput', S.camId);
  $('#micSel').innerHTML = opt('audioinput', S.micId);
  $('#outSel').innerHTML = opt('audiooutput', S.outId, true);
}
function renderCable() {
  const has = devices.some(d => d.kind === 'audiooutput' && /CABLE Input/i.test(d.label));
  const el = $('#cable');
  el.className = 'note ' + (has ? 'ok' : 'warn');
  el.innerHTML = has ? esc(t('s_cable_ok'))
    : `${esc(t('s_cable_missing'))} <a href="https://vb-audio.com/Cable/" target="_blank">${esc(t('s_cable_get'))}</a>`;
}
$('#camSel').onchange = e => save({ camId: e.target.value });
$('#micSel').onchange = e => save({ micId: e.target.value });
$('#outSel').onchange = e => save({ outId: e.target.value });
navigator.mediaDevices.addEventListener('devicechange', loadDevices);

// ---------- first-run wizard ----------
let step = 0;   // 0 = wizard off
const STEPS = [null, ['settings', 'sec-profile'], ['settings', 'sec-devices'], ['help', 'sec-obs'], ['help', 'sec-zoom']];
function renderWizard() {
  const on = step > 0;
  $('#wiz').hidden = $('#wizNav').hidden = !on; $('#tabs').hidden = on;
  $$('.card[id^=sec-]').forEach(c => c.hidden = false);
  if (!on) return;
  const [tab, sec] = STEPS[step];
  showTab(tab);
  $$(`section[data-page=${tab}] .card`).forEach(c => c.hidden = c.id !== sec);
  $('#wizN').textContent = step; $('#wizT').textContent = t('w_t' + step); $('#wizS').textContent = t('w_s' + step);
  $('#wizBack').style.visibility = step > 1 ? 'visible' : 'hidden';
  $('#wizNext').textContent = t(step === 4 ? 'w_done' : 'w_next');
}
$('#wizBack').onclick = () => { step = Math.max(1, step - 1); renderWizard(); };
$('#wizNext').onclick = async () => {
  if (step < 4) { step++; return renderWizard(); }
  step = 0; await save({ setupDone: true }); renderWizard(); showTab('remote');
};

// ---------- preview: the same picture OBS gets ----------
const preview = $('#preview');
function connectPreview() { preview.src = 'http://127.0.0.1:5174/stream.mjpg?t=' + Date.now(); }
preview.onerror = () => setTimeout(connectPreview, 1000);
window.fl.onRemoteReady(connectPreview);
$('#copyObs').onclick = () => { navigator.clipboard.writeText($('#obsUrl').textContent); $('#copyObs').textContent = t('copied'); setTimeout(() => { $('#copyObs').textContent = t('copy'); }, 1500); };

// ---------- boot ----------
(async () => {
  S = await window.fl.getSettings();
  applySettings();
  if (!S.setupDone) step = 1;
  S.lang = S.lang || 'he'; syncLang();
  if (!step) showTab('remote');
  connectPreview();
  await loadDevices();
  refreshRemote();
})();
