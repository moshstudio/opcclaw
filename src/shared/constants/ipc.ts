/**
 * IPC 通信频道常量
 */

export const IPC_CHANNELS = {
  /** Gateway 客户端请求 */
  GATEWAY_REQUEST: 'gateway:request',
  /** Gateway 事件推送 */
  GATEWAY_EVENT: 'gateway:event',

  /** Agent 调用 */
  AGENT_CALL: 'agent:call',
  /** Agent 事件订阅 */
  AGENT_EVENT: 'agent:event'
} as const
