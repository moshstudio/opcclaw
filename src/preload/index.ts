import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: any) => ipcRenderer.invoke('config:save', config),
    addModel: (model: any) => ipcRenderer.invoke('model:add', model),
    updateModel: (id: string, updates: any) => ipcRenderer.invoke('model:update', id, updates),
    deleteModel: (id: string) => ipcRenderer.invoke('model:delete', id),
    testModel: (modelConfig: any) => ipcRenderer.invoke('config:testModel', modelConfig)
  },
  app: {
    reset: () => ipcRenderer.invoke('app:reset')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
