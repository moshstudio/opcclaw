import { FeishuChannelConfig } from '@shared/types/config'
import { BaseChannelOptions } from '../base/types'

export interface FeishuChannelOptions extends BaseChannelOptions, FeishuChannelConfig {
  appId: string
  appSecret: string
}

export type FeishuChatType = 'p2p' | 'group' | 'private'

export interface FeishuMention {
  key: string
  id: {
    open_id?: string
    user_id?: string
    union_id?: string
  }
  name: string
  tenant_key?: string
}

export interface FeishuMessageEvent {
  sender: {
    sender_id: {
      open_id?: string
      user_id?: string
      union_id?: string
    }
    sender_type?: string
    tenant_key?: string
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
    mentions?: FeishuMention[]
  }
}

/**
 * 飞书卡片消息回传交互回调 (Schema 2.0)
 * 注意：交互回调的结构是平铺的，与普通事件消息(header/event)不同
 */
export interface FeishuCardActionTriggerEvent {
  schema: '2.0'
  event_id: string
  token: string
  create_time: string
  event_type: 'card.action.trigger'
  tenant_key: string
  app_id: string
  operator: {
    tenant_key: string
    user_id?: string
    open_id: string
    union_id?: string
  }
  action: {
    value: any // 开发者自定义数据
    tag: string // 交互组件标签 (如 button, input 等)
    timezone: string
    name?: string // 组件自定义唯一标识
    form_value?: Record<string, any> // 表单提交的数据
    input_value?: string // 输入框提交的数据 (非表单内)
    option?: string // 单选组件的选择值
    options?: string[] // 多选组件的选择值
    checked?: boolean // 勾选器组件的数据
  }
  host: string
  context: {
    url?: string
    preview_token?: string
    open_message_id: string
    open_chat_id: string
  }
}

/**
 * 飞书卡片操作响应
 */
export interface FeishuCardActionResponse {
  toast?: {
    type: 'info' | 'success' | 'error' | 'warning'
    content?: string
    i18n?: Record<string, string>
  }
  card?: {
    type: 'raw' | 'template'
    data: any
  }
}
