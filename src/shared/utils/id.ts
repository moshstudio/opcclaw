/**
 * 跨平台 ID 生成工具
 */

export function newId(): string {
  // 浏览器和 Node.js 16+ 均支持 crypto.randomUUID()
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // 回退方案（非商用高安全场景可接受）
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}
