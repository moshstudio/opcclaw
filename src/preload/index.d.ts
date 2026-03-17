import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      gateway: {
        request: (method: string, params?: unknown) => Promise<any>
        onEvent: (callback: (data: any) => void) => () => void
      }
      config: {
        get: () => Promise<any>
        save: (config: any) => Promise<any>
        addModel: (model: any) => Promise<any>
        updateModel: (id: string, updates: any) => Promise<any>
        deleteModel: (id: string) => Promise<any>
      }
    }
  }
}
