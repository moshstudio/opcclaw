import { getGatewayClient } from './gateway-client'
import type { TelegramValidationResult, FeishuValidationResult } from '@shared/types/config'

/**
 * 验证 Telegram Bot Token
 */
export async function validateTelegramBot(token: string, useProxy: boolean) {
  const client = getGatewayClient()
  const res = await client.request<TelegramValidationResult>('channel:telegram:test', {
    token,
    useProxy
  })

  if (!res.ok) {
    throw new Error(res.error || '验证失败')
  }

  return res.info
}

/**
 * 验证 飞书 App
 */
export async function validateFeishuApp(appId: string, appSecret: string) {
  const client = getGatewayClient()
  const res = await client.request<FeishuValidationResult>('channel:feishu:test', {
    appId,
    appSecret
  })

  if (!res.ok) {
    throw new Error(res.error || '验证失败')
  }

  return res.info
}
