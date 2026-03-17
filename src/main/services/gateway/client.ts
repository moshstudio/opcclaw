import WebSocket from 'ws'
import { BaseGatewayClient } from '@shared/services/gateway-client-core'
import { type GatewayClientOptions } from '@shared/types/gateway'
export class GatewayClient extends BaseGatewayClient {
  constructor(opts: GatewayClientOptions) {
    super(opts)
  }
  protected createSocket(url: string): any {
    return new WebSocket(url)
  }
}
