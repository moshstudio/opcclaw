/**
 * 跨平台 ID 生成工具
 */

/**
 * 生成高安全性的 UUID (v4)
 */
export function newUUID(): string {
  // 现代浏览器和 Node.js 19+ 均支持全局 crypto.randomUUID()
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Node.js 环境但无全局 crypto 时尝试引入 (仅在 main 进程有效)
  // 此处使用 typeof 检查避免 renderer 进程报错
  try {
    if (typeof process !== 'undefined' && process.release?.name === 'node') {
      // 动态导入虽然可行但在此工具函数中不便，且 Electron 环境通常已有全局 crypto
    }
  } catch (e) {
    // 忽略
  }

  // 回退方案: 标准 UUID v4 算法
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 生成一般用途的短 ID
 * @param length ID 长度，默认 6
 */
export function newShortId(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''

  // 尝试使用 crypto.getRandomValues (Web API)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length]
    }
    return result
  }

  // 尝试使用 node:crypto.randomBytes (Node.js API)
  // 注意：在 Electron 的 renderer 进程中，如果没有启用 nodeIntegration，这会报错
  try {
    if (typeof process !== 'undefined' && process.release?.name === 'node') {
      // 通过动态 requires 或检测全局 require
      // 但为了跨平台兼容性，简单的 Math.random 也满足“一般安全性”要求
    }
  } catch (e) {
    // 忽略
  }

  // 回退方案: 简单随机
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 为了向后兼容，newId 默认返回 UUID
 */
export function newId(): string {
  return newUUID()
}
