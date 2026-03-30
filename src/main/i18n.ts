import i18next from 'i18next'
import { join } from 'path'
import { readFileSync, readdirSync } from 'node:fs'
import { is } from '@electron-toolkit/utils'

const localesDir = is.dev
  ? join(__dirname, '../../src/renderer/src/locales')
  : join(process.resourcesPath, 'app.asar.unpacked/src/renderer/src/locales')

export async function initI18n(lang: string = 'zh'): Promise<void> {
  const resources: any = {}

  try {
    const dirs = readdirSync(localesDir)
    for (const d of dirs) {
      resources[d] = {}
      const files = readdirSync(join(localesDir, d))
      for (const f of files) {
        if (f.endsWith('.json')) {
          const ns = f.replace('.json', '')
          const content = readFileSync(join(localesDir, d, f), 'utf-8')
          resources[d][ns] = JSON.parse(content)
        }
      }
    }
  } catch (err) {
    console.error('Failed to load i18n resources for main process:', err)
  }

  await i18next.init({
    lng: lang,
    fallbackLng: 'zh',
    resources,
    interpolation: {
      escapeValue: false
    }
  })
}

export const t = i18next.t.bind(i18next)
export const changeLanguage = i18next.changeLanguage.bind(i18next)
