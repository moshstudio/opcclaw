import { NoticePayload } from '@shared/types/gateway'
import { SessionPatch } from './chat-handler'

/**
 * Notice 事件专门处理器
 * 职责：处理 notice:compact, notice:info 等业务提示类事件，实现与主聊天逻辑解耦。
 */
export const applyNoticeEvent = (payload: NoticePayload, patch: SessionPatch): SessionPatch => {
  const { type } = payload

  switch (type) {
    case 'notice:compact':
      // 逻辑：如果有 firstKeptEntryId，则从消息列表中裁剪掉该 ID 之前的消息
      if (payload.firstKeptEntryId) {
        const { messages } = patch
        const idx = messages.findIndex((m) => m.id === (payload.firstKeptEntryId as string))
        if (idx !== -1) {
          // 修改 patch 中的 messages 引用
          patch.messages = messages.slice(idx)
        }
      }
      break

    case 'notice:info':
      // 处理普通信息提示，例如“指令已注入”
      // 在这里可以通过 console 记录，未来可扩展为全局 Toast 或 Snackbar
      console.info(
        `[Notice:Info] ${payload.text || payload.delta || payload.error || 'Notification received'}`
      )
      break

    default:
      break
  }

  return patch
}
