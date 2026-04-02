import { NoticePayload } from '@shared/types/gateway'
import { SessionPatch } from './chat-handler'
import { toast } from 'sonner'
import i18n from '@renderer/i18n'

/**
 * Notice 事件专门处理器
 * 职责：处理 notice:compact, notice:info 等业务提示类事件，实现与主聊天逻辑解耦。
 */
export const applyNoticeEvent = (payload: NoticePayload, patch: SessionPatch): SessionPatch => {
  const { type } = payload

  switch (type) {
    case 'notice:compact': {
      const { firstKeptId } = payload
      if (firstKeptId === undefined || firstKeptId === null) return patch

      let nextMessages = [...patch.messages]
      if (firstKeptId === '') {
        nextMessages = []
      } else {
        const idx = nextMessages.findIndex((m) => m.id === firstKeptId)
        if (idx !== -1) {
          nextMessages = nextMessages.slice(idx)
        }
      }

      toast.info(i18n.t('common.archived_compact'), {
        position: 'top-center',
        duration: 3000
      })

      return {
        ...patch,
        messages: nextMessages
      }
    }

    case 'notice:info': {
      const { text } = payload
      if (text) {
        toast.success(text, { position: 'bottom-right' })
      }
      break
    }

    case 'notice:warning': {
      const { text, delta } = payload
      if (text || delta) {
        toast.warning(text || delta, { position: 'bottom-right' })
      }
      break
    }

    case 'notice:error': {
      const { error, text } = payload
      if (error || text) {
        toast.error(error || text, { position: 'bottom-right', duration: 5000 })
      }
      break
    }

    default:
      break
  }

  return patch
}
