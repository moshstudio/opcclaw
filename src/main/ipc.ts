import { ipcMain, app, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ConfigService } from './services/config/config-service.js'
import { GatewayManager } from './services/gateway/manager.js'

export function initIpcServices(): void {
  // 1. 配置读写 IPC

  // 极简握手：仅用于前端获取 Gateway 连接凭据
  ipcMain.removeHandler('gateway:info')
  ipcMain.handle('gateway:info', async () => {
    const config = ConfigService.getInstance().getConfig()
    return {
      port: config.gateway?.port || 18789,
      token: config.gateway?.token
    }
  })

  // 2. 软件重启/重置 IPC
  ipcMain.removeHandler('app:reset')
  ipcMain.handle('app:reset', async () => {
    console.log('[IPC] App reset requested')

    try {
      // 1. 停止网关
      GatewayManager.getInstance().stop()

      // 2. 清理 Electron 渲染进程存储 (Local Storage, Cookies, IndexedDB, etc.)
      console.log('[IPC] Clearing storage data via session API...')
      await session.defaultSession.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage'
        ]
      })

      // 3. 删除自定义数据文件夹 (.opcclaw)
      const opcclawRoot = ConfigService.getInstance().getRootPath()
      console.log(`[IPC] Cleaning opcclawRoot: ${opcclawRoot}`)
      if (fs.existsSync(opcclawRoot)) {
        // 在 Windows 上，有时即便清除了 session，某些文件可能仍有短暂延迟
        // 我们尝试多次或捕获错误
        try {
          fs.rmSync(opcclawRoot, { recursive: true, force: true })
        } catch (e) {
          console.warn('[IPC] Primary cleanup failed, trying individual items...', e)
          // 如果整体删除失败，至少尝试删除配置文件
          const configJson = path.join(opcclawRoot, 'config.json')
          if (fs.existsSync(configJson)) {
            fs.unlinkSync(configJson)
          }
        }
      }

      console.log('[IPC] Reset sequence completed, relaunching...')

      // 延迟一秒重启，确保文件系统操作完成
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 1000)

      return { ok: true }
    } catch (err) {
      console.error('[IPC] Error during reset:', err)
      return { ok: false, error: String(err) }
    }
  })
}
