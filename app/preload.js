const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coach', {
  state: () => ipcRenderer.invoke('state'),
  toggleTask: (date, id, v) => ipcRenderer.invoke('toggleTask', date, id, v),
  toggleSub: (date, id, v) => ipcRenderer.invoke('toggleSub', date, id, v),
  checkUpdate: () => ipcRenderer.invoke('checkUpdate'),
  applyUpdate: () => ipcRenderer.invoke('applyUpdate'),
  dsa: (date, o) => ipcRenderer.invoke('dsa', date, o),
  backlog: (date, ids, action) => ipcRenderer.invoke('backlog', date, ids, action),
  dayPlan: date => ipcRenderer.invoke('dayPlan', date),
  planEdit: (date, op) => ipcRenderer.invoke('planEdit', date, op),
  startFresh: date => ipcRenderer.invoke('startFresh', date),
  checkin: p => ipcRenderer.invoke('checkin', p),
  weekItem: (k, item, v) => ipcRenderer.invoke('weekItem', k, item, v),
  settings: s => ipcRenderer.invoke('settings', s),
  test: kind => ipcRenderer.invoke('test', kind),
  onRefresh: cb => ipcRenderer.on('refresh', () => cb())
});
