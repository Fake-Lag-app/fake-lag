const { contextBridge, ipcRenderer } = require('electron');
const on = ch => f => ipcRenderer.on(ch, (e, d) => f(d));
contextBridge.exposeInMainWorld('fl', {
  onCmd: on('cmd'), onState: on('state'), onSettings: on('settings'), onCamClosed: on('camClosed'),
  onRemoteReady: on('remoteReady'), onSelftestTab: on('selftestTab'), onStream: on('stream'),
  frame: bytes => ipcRenderer.send('frame', bytes),
  sendState: s => ipcRenderer.send('state', s),
  cmd: c => ipcRenderer.send('cmd', c),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: p => ipcRenderer.invoke('settings:set', p),
  remoteInfo: () => ipcRenderer.invoke('remote:info'),
  newRemoteToken: () => ipcRenderer.invoke('remote:newToken'),
  showCam: () => ipcRenderer.invoke('cam:show'),
  storeList: q => ipcRenderer.invoke('store:list', q),
  storeSubmit: item => ipcRenderer.invoke('store:submit', item),
  storeLike: id => ipcRenderer.invoke('store:like', id),
  adminPending: () => ipcRenderer.invoke('admin:pending'),
  adminAct: (id, action) => ipcRenderer.invoke('admin:act', { id, action }),
});
