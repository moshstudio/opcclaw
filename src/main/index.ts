import { app, shell, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { GatewayManager } from './services/gateway/manager'
import { ConfigService } from './services/config/config-service'
import { AgentRegistry } from './services/agent/registry'
import { ChannelManager } from './services/channels/manager' // 新增导入
import { setSystemClosing, Logger } from './services/common/logger'
import { initIpcServices } from './ipc'
import { t, initI18n, changeLanguage } from './i18n'

const mainLogger = new Logger('[Main]')

let tray: Tray | null = null

function updateTrayMenu(): void {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('common:show_window'),
      click: (): void => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          windows[0].show()
        } else {
          createWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: t('common:quit'),
      click: (): void => {
        app.quit()
      }
    }
  ])
  tray.setToolTip(t('common:chat') + ' (opcclaw)')
  tray.setContextMenu(contextMenu)
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: '猫爪 (opcclaw)',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('opcclaw')

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // --- 初始化 i18n ---
  const locale = app.getLocale().toLowerCase()
  await initI18n(locale.startsWith('zh') ? 'zh' : 'en')

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.opcclaw')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- 初始化 系统托盘 ---
  tray = new Tray(icon)
  updateTrayMenu()

  tray.on('double-click', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      windows[0].show()
    } else {
      createWindow()
    }
  })

  // --- 语言切换监听 ---
  ipcMain.handle('app:change-language', async (_, lang: string) => {
    await changeLanguage(lang)
    updateTrayMenu()
  })

  // IPC test
  ipcMain.on('ping', () => mainLogger.info('pong'))

  // --- 初始化 IPC 服务 ---
  initIpcServices()

  // --- 初始化核心服务 ---
  const config = ConfigService.getInstance().getConfig()
  GatewayManager.getInstance()
    .start(config.gateway?.logLevel || 'info')
    .then(() => {
      mainLogger.info('Gateway manager started successfully')

      // 在后台初始化应用内置 Channel，不阻塞后续逻辑
      ChannelManager.getInstance()
        .startAll()
        .catch((err) => {
          mainLogger.error('Failed to start integrated channels:', err)
        })
    })
    .catch((err) => {
      mainLogger.error('Failed to start core service:', err)
    })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  setSystemClosing()
  await ChannelManager.getInstance().stopAll() // 优雅停止外部频道
  GatewayManager.getInstance().stop()
  try {
    AgentRegistry.getInstance().stopAll()
  } catch (err) {
    mainLogger.error('Failed to stop agents during quit:', err)
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
