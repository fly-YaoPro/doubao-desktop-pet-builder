import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PetAPI, Reminder, Settings, TypingStatus } from './shared/contracts';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: PetAPI = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    update: (patch) => ipcRenderer.invoke('settings:update', patch) as Promise<Settings>,
  },
  reminders: {
    list: () => ipcRenderer.invoke('reminders:list') as Promise<Reminder[]>,
    save: (input) => ipcRenderer.invoke('reminders:save', input) as Promise<Reminder>,
    remove: (id) => ipcRenderer.invoke('reminders:remove', id) as Promise<boolean>,
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file),
    put: (paths) => ipcRenderer.invoke('files:put', paths),
    openPocket: () => ipcRenderer.invoke('files:open-pocket') as Promise<void>,
  },
  window: {
    beginDrag: () => ipcRenderer.invoke('window:drag-begin') as Promise<void>,
    updateDrag: () => ipcRenderer.invoke('window:drag-update') as Promise<void>,
    endDrag: () => ipcRenderer.invoke('window:drag-end') as Promise<void>,
    showDashboard: () => ipcRenderer.invoke('window:show-dashboard') as Promise<void>,
    hidePet: () => ipcRenderer.invoke('window:hide-pet') as Promise<void>,
  },
  events: {
    onStateActivity: (listener) => subscribe<{ kind: string }>('state:activity', listener),
    onReminder: (listener) => subscribe<Reminder>('reminder:due', listener),
    onTypingStatus: (listener) => subscribe<TypingStatus>('typing:status', listener),
  },
};

contextBridge.exposeInMainWorld('petAPI', api);
