import { FeishuChannelConfig } from '@shared/types/config'
import { BaseChannelOptions } from '../base/types'

export interface FeishuChannelOptions extends BaseChannelOptions, FeishuChannelConfig {
  appId: string
  appSecret: string
}

export type FeishuChatType = 'p2p' | 'group' | 'private'

export interface FeishuMessageEvent {
  sender: {
    sender_id: {
      open_id?: string
      user_id?: string
      union_id?: string
    }
    sender_type?: string
  }
  message: {
    message_id: string
    root_id?: string
    parent_id?: string
    thread_id?: string
    chat_id: string
    chat_type: FeishuChatType
    message_type: string
    content: string
    create_time?: string
    mentions?: Array<{
      key: string
      id: {
        open_id?: string
        user_id?: string
        union_id?: string
      }
      name: string
    }>
  }
}
