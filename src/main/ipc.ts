import { ipcMain } from 'electron'
import { ConfigService } from './services/config/config-service.js'
import { GatewayManager } from './services/gateway/manager.js'

export function initIpcServices(): void {
  // 1. 配置读写 IPC

  ipcMain.removeHandler('config:get')
  ipcMain.handle('config:get', async () => {
    return ConfigService.getInstance().getConfig()
  })

  ipcMain.removeHandler('config:save')
  ipcMain.handle('config:save', async (_event, config) => {
    ConfigService.getInstance().saveConfig(config)
    // 如果修改了网关配置，执行重启
    if (config.gateway) {
      await GatewayManager.getInstance().restart()
    }
    return { ok: true }
  })

  ipcMain.removeHandler('model:add')
  ipcMain.handle('model:add', async (_event, model) => {
    ConfigService.getInstance().addModel(model)
    return { ok: true }
  })

  ipcMain.removeHandler('model:update')
  ipcMain.handle('model:update', async (_event, id, updates) => {
    ConfigService.getInstance().updateModel(id, updates)
    return { ok: true }
  })

  ipcMain.removeHandler('model:delete')
  ipcMain.handle('model:delete', async (_event, id) => {
    ConfigService.getInstance().deleteModel(id)
    return { ok: true }
  })
}
