import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      gateway: {
        info: () => Promise<{ port: number; token?: string }>
      }
      app: {
        reset: () => Promise<{ ok: boolean; error?: string }>
      }
    }
  }
}
