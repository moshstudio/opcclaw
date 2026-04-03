import axios, { AxiosInstance } from 'axios'
import { Logger } from '@main/services/common/logger'

const API_BASE = 'https://api.sgroup.qq.com'
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'

export interface QQMessageResponse {
  id: string
  timestamp: string | number
  ext_info?: {
    ref_idx?: string
  }
}

export class QQApi {
  private readonly logger = new Logger('[QQApi]')
  private readonly client: AxiosInstance
  private accessToken: string | null = null
  private expiresAt = 0

  constructor(
    private readonly appId: string,
    private readonly clientSecret: string
  ) {
    this.client = axios.create({
      baseURL: API_BASE,
      timeout: 30000
    })
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60000) {
      return this.accessToken
    }

    try {
      const res = await axios.post(TOKEN_URL, {
        appId: this.appId,
        clientSecret: this.clientSecret
      })

      if (res.data.access_token) {
        this.accessToken = res.data.access_token
        this.expiresAt = Date.now() + (res.data.expires_in || 7200) * 1000
        return this.accessToken!
      }
      throw new Error('No access_token in response')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error('Failed to get access token:', msg)
      throw err
    }
  }

  async getGatewayUrl(): Promise<string> {
    const token = await this.getAccessToken()
    const res = await this.client.get('/gateway', {
      headers: { Authorization: `QQBot ${token}` }
    })
    return res.data.url
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken()
    try {
      const res = await this.client.request({
        method,
        url,
        data,
        headers: {
          Authorization: `QQBot ${token}`,
          'Content-Type': 'application/json'
        }
      })
      return res.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`API Error [${url}]:`, msg)
      throw err
    }
  }

  async sendC2CMessage(
    openid: string,
    content: string,
    msgId?: string,
    markdown?: boolean
  ): Promise<QQMessageResponse> {
    const body: Record<string, unknown> = markdown
      ? { markdown: { content }, msg_type: 2 }
      : { content, msg_type: 0 }
    if (msgId) body.msg_id = msgId
    body.msg_seq = Math.floor(Math.random() * 65535)

    return this.request<QQMessageResponse>('POST', `/v2/users/${openid}/messages`, body)
  }

  async sendGroupMessage(
    groupOpenid: string,
    content: string,
    msgId?: string,
    markdown?: boolean
  ): Promise<QQMessageResponse> {
    const body: Record<string, unknown> = markdown
      ? { markdown: { content }, msg_type: 2 }
      : { content, msg_type: 0 }
    if (msgId) body.msg_id = msgId
    body.msg_seq = Math.floor(Math.random() * 65535)

    return this.request<QQMessageResponse>('POST', `/v2/groups/${groupOpenid}/messages`, body)
  }

  async sendChannelMessage(
    channelId: string,
    content: string,
    msgId?: string
  ): Promise<QQMessageResponse> {
    const body: { content: string; msg_id?: string } = { content }
    if (msgId) body.msg_id = msgId
    return this.request<QQMessageResponse>('POST', `/channels/${channelId}/messages`, body)
  }

  async sendC2CInputNotify(openid: string, msgId?: string): Promise<void> {
    const body = {
      msg_type: 6,
      input_notify: { input_type: 1, input_second: 30 },
      msg_seq: Math.floor(Math.random() * 65535),
      ...(msgId ? { msg_id: msgId } : {})
    }
    await this.request('POST', `/v2/users/${openid}/messages`, body)
  }

  async getMe(): Promise<{ id: string; username: string }> {
    const data = await this.request<{ id: string; username: string }>('GET', '/users/@me')
    return {
      id: data.id,
      username: data.username
    }
  }
}
