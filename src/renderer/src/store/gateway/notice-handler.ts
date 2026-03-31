import { NoticePayload } from '@shared/types/gateway'
import { SessionPatch } from './chat-handler'
import { toast } from 'sonner'
import i18n from '@renderer/i18n'

/**
 * Notice 事件专门处理器
 * 职责：处理 notice:compact, notice:info 等业务提示类事件，实现与主聊天逻辑解耦。
 */
export const applyNoticeEvent = (payload: NoticePayload, patch: SessionPatch): SessionPatch => {
  const { type, firstKeptId, text, delta, error } = payload

  switch (type) {
    case 'notice:compact': {
      if (!firstKeptId) break

      const idx = patch.messages.findIndex((m) => m.id === firstKeptId)
      // 如果找到索引且不是第 0 条（说明有消息需要被裁掉）
      if (idx > 0) {
        patch.messages = patch.messages.slice(idx)
      }
      toast.info(i18n.t('common.archived_compact'), {
        position: 'top-center',
        duration: 3000
      })
      break
    }

    case 'notice:info':
      if (text || delta) {
        toast.success(text || delta, { position: 'bottom-right' })
      }
      break

    case 'notice:warning':
      if (text || delta) {
        toast.warning(text || delta, { position: 'bottom-right' })
      }
      break

    case 'notice:error':
      if (error || text) {
        toast.error(error || text, { position: 'bottom-right', duration: 5000 })
      }
      break

    default:
      if (text || delta) console.log(`[Notice:${type}]`, text || delta)
      break
  }

  return patch
}
