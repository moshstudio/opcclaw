/**
 * Gateway 模块导出
 */

export { startGatewayServer, type GatewayServer, type GatewayServerOptions } from './server'
export { GatewayClient } from './client'
export {
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type HelloOk,
  type GatewayClientOptions,
  type ErrorShape,
  type GatewayFrame,
  ErrorCodes,
  errorShape,
  PROTOCOL_VERSION,
  GATEWAY_METHODS,
  GATEWAY_EVENTS
} from './protocol'
export { handlers, type Handler, type HandlerContext } from './handlers/index'
