import { Message, Agent } from '../agent'
import { AIModelConfig } from '../models'

export type HelloOk = {
  protocol: number
  methods: string[]
  events: string[]
  policy: { tickIntervalMs: number; maxPayloadBytes: number }
}
// 前端向gateway请求的事件格式: 参数和返回结果
export interface RequestMethodMap {
  connect: { params: { token?: string; nonce?: string }; result: HelloOk }
  'chat:send': {
    params: { agentId: string; sessionKey: string; message: string }
    result: { runId: string }
  }
  'chat:abort': { params: { runId: string }; result: void }
  'chat:history': {
    params: { agentId: string; sessionKey: string; limit?: number; offset?: number }
    result: { messages: Message[] }
  }
  'chat:respondInteraction': {
    params: { agentId: string; interactionId: string; result: boolean; remember: boolean }
    result: void
  }
  'agent:list': { params: void; result: { agents: Agent[] } }
  'agent:create': { params: { config: Partial<Agent> }; result: Agent }
  'agent:update': { params: { agentId: string; config: Partial<Agent> }; result: Agent }
  'agent:delete': { params: { agentId: string }; result: void }
  'sessions:create': { params: { agentId: string }; result: { sessionKey: string } }
  'sessions:list': { params: { agentId: string }; result: { sessionKeys: string[] } }
  'sessions:reset': { params: { agentId: string; sessionKey: string }; result: void }
  'sessions:delete': { params: { agentId: string; sessionKey: string }; result: void }
  'tools:list': { params: void; result: { tools: unknown[] } }
  'skills:list': { params: void; result: { skills: unknown[] } }
  'skills:install': { params: { name: string }; result: void }
  'skills:update': { params: { name: string }; result: void }
  'skills:delete': { params: { name: string }; result: void }
  'bootstrap:list': { params: void; result: unknown }
  'bootstrap:save': { params: unknown; result: void }
  'usage:stats': { params: void; result: unknown }
  'config:get': { params: void; result: unknown }
  'config:save': { params: unknown; result: void }
  'models:fetch': { params: void; result: void }
  'models:add': { params: { model: AIModelConfig }; result: void }
  'models:update': { params: { model: AIModelConfig }; result: void }
  'models:delete': { params: { modelId: string }; result: void }
  'models:setDefault': { params: { modelId: string }; result: void }
  'models:test': { params: { modelId: string }; result: void }
  'models:providers': { params: void; result: string[] }
  'channel:telegram:test': { params: { token: string; useProxy?: boolean }; result: any }
  'channel:feishu:test': { params: { appId: string; appSecret: string }; result: any }
  'heartbeat:list': { params: void; result: unknown }
  'heartbeat:update': { params: { agentId: string; config: unknown }; result: void }
  'heartbeat:trigger': { params: { agentId: string }; result: void }
  'heartbeat:save-file': { params: { agentId: string; content: string }; result: void }
  'heartbeat:delete-file': { params: { agentId: string }; result: void }
  'heartbeat:get-file': { params: { agentId: string }; result: { content: string } }
  'heartbeat:logs': { params: { agentId: string }; result: unknown }
  'system:events-doc': { params: void; result: string }
  health: { params: void; result: { uptimeMs: number; clients: number; system: string } }
}

export type GatewayMethod = keyof RequestMethodMap
