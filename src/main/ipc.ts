import { ipcMain, app, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ConfigService } from './services/config/config-service.js'
import { GatewayManager } from './services/gateway/manager.js'
import { AgentRegistry } from './services/agent/registry.js'

export function initIpcServices(): void {
  // 1. 配置读写 IPC

  ipcMain.removeHandler('config:get')
  ipcMain.handle('config:get', async () => {
    return ConfigService.getInstance().getConfig()
  })

  ipcMain.removeHandler('config:save')
  ipcMain.handle('config:save', async (_event, config) => {
    const configService = ConfigService.getInstance()
    const oldConfig = configService.getConfig()

    configService.saveConfig(config)

    // 如果修改了网关配置，执行重启
    if (config.gateway) {
      await GatewayManager.getInstance().restart()
    }

    // 如果修改了默认模型或模型列表，重新加载所有智能体以确保即时生效
    const modelChanged =
      config.defaultModelId !== undefined && config.defaultModelId !== oldConfig.defaultModelId
    const modelsListChanged = config.models !== undefined // 简单判断，即只要传了 models 就重载

    if (modelChanged || modelsListChanged) {
      console.log('[IPC] Model config changed via saveConfig, reloading all agents...')
      await AgentRegistry.getInstance().loadAllAgents()
    }

    return { ok: true }
  })

  ipcMain.removeHandler('model:add')
  ipcMain.handle('model:add', async (_event, model) => {
    const newModel = ConfigService.getInstance().addModel(model)
    return { ok: true, model: newModel }
  })

  ipcMain.removeHandler('model:update')
  ipcMain.handle('model:update', async (_event, id, updates) => {
    ConfigService.getInstance().updateModel(id, updates)
    // 模型配置更新后，重新加载所有智能体以确保即时生效
    await AgentRegistry.getInstance().loadAllAgents()
    return { ok: true }
  })

  ipcMain.removeHandler('model:delete')
  ipcMain.handle('model:delete', async (_event, id) => {
    ConfigService.getInstance().deleteModel(id)
    // 模型删除后（可能涉及默认模型重置），重新加载所有智能体
    await AgentRegistry.getInstance().loadAllAgents()
    return { ok: true }
  })

  ipcMain.removeHandler('config:testModel')
  ipcMain.handle('config:testModel', async (_event, modelConfig) => {
    return ConfigService.getInstance().testModel(modelConfig)
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
