const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coach', {
  state: () => ipcRenderer.invoke('state'),
  toggleTask: (date, id, v) => ipcRenderer.invoke('toggleTask', date, id, v),
  toggleSub: (date, id, v) => ipcRenderer.invoke('toggleSub', date, id, v),
  habit: (date, id, o) => ipcRenderer.invoke('habit', date, id, o),
  weekItem: (track, n, item, v) => ipcRenderer.invoke('weekItem', track, n, item, v),
  weekGoal: (item, v) => ipcRenderer.invoke('weekGoal', item, v),
  checkin: p => ipcRenderer.invoke('checkin', p),
  importPlan: text => ipcRenderer.invoke('importPlan', text),
  resetPlan: () => ipcRenderer.invoke('resetPlan'),
  checkUpdate: () => ipcRenderer.invoke('checkUpdate'),
  applyUpdate: () => ipcRenderer.invoke('applyUpdate'),
  settings: s => ipcRenderer.invoke('settings', s),
  test: kind => ipcRenderer.invoke('test', kind),
  onRefresh: cb => ipcRenderer.on('refresh', () => cb())
});
