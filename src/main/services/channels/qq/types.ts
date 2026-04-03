import { BaseChannelOptions, CommonRun } from '../base/types'

/** QQ 平台消息元数据，用于回复识别和频率管控凭证 */
export interface QQMessageMeta {
  /** 原始消息唯一 ID，用于作为被动回复凭证 (5分钟内有效) */
  msgId: string
  /** 消息来源上下文类型 */
  type: 'c2c' | 'group' | 'channel' | 'dm'
}

/** 针对 QQ 频道定制的运行状态对象 */
export interface QQRun extends CommonRun {
  /** 挂载当前对话生命周期的物理回复凭证 */
  meta?: QQMessageMeta
}

/** QQ 频道私有配置 */
export interface QQChannelOptions extends BaseChannelOptions {
  /** 机器人的 AppID */
  appId: string
  /** 机器人的 ClientSecret */
  clientSecret: string
  /** 是否为公域机器人 (影响权限声明) */
  isPublic?: boolean
  /** 是否支持 Markdown 渲染 (通常 C2C 需要权限) */
  markdownSupport?: boolean
}
