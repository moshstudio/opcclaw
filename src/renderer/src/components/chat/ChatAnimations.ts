import { Variants, Transition } from 'framer-motion'

/**
 * 极简、高性能的动画配置，以绝对流畅为第一优先级。
 * 使用标准的 easeOut 而非 Spring，确保每一帧的计算量降至最低。
 */
export const CHAT_TRANSITION: Transition = {
  duration: 0.2, // 极短的时长
  ease: [0.16, 1, 0.3, 1] // 经典的流畅曲线
}

/**
 * 统一的消息动效：仅做微小的位移和淡入
 */
const UNIFIED_VARIANTS: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: CHAT_TRANSITION
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.1 }
  }
}

export const MESSAGE_LIST_VARIANTS = UNIFIED_VARIANTS
export const MESSAGE_BLOCK_VARIANTS = UNIFIED_VARIANTS

/**
 * 等待状态的小球动画
 */
export const LOADING_DOT_VARIANTS: Variants = {
  animate: (i: number) => ({
    y: [0, -10, 0],
    opacity: [0.4, 1, 0.4],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      delay: i * 0.15,
      ease: 'easeInOut'
    }
  })
}
