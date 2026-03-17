/**
 * Gateway 协议帧定义
 *
 * 已重构：从 @shared/types/gateway 引入基础定义
 */

import { newId as sharedNewId } from '@shared/utils/id'

export * from '@shared/types/gateway'

/**
 * 获取新 ID (包装 shared 版)
 */
export function newId(): string {
  return sharedNewId()
}
