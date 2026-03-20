import { getGatewayClient } from '../services/gateway-client'
import { useChatStore } from './useChatStore'
import { useAgentStore } from './useAgentStore'
import { useModelStore } from './useModelStore'
import { useSystemStore } from './useSystemStore'
import {
  ChatPayload,
  AgentEventPayload,
  ModelsPayload,
  TickPayload,
  ShutdownPayload
} from '@shared/types/gateway'

let isInitialized = false

/**
 * GatewaySync: 渲染进程全系统的网关事件分发调度中心 (Architecture Orchestrator)
 *
 * 职责：
 * 1. 订阅 GatewayClient 的所有频道广播 (Channel Listeners)
 * 2. 识别 Payload 意图并分发到对应的 Zustand Store (Event Dispatching)
 * 3. 协调初始连接与初始数据的依赖加载 (Initialization)
 */
export const initGatewaySync = () => {
  if (isInitialized) return
  isInitialized = true

  const client = getGatewayClient()

  // --- 1. 系统与连接事件分发 (Connection Logic) ---
  client.onConnect(() => {
    useSystemStore.getState().handleConnect()

    // 连接成功（含重连成功）后，触发各领域的基础数据加载与同步
    useAgentStore.getState().fetchAgents()
    useModelStore.getState().fetchModels()
  })

  client.onClose(() => {
    useSystemStore.getState().handleDisconnect()
  })

  client.onTick((payload: TickPayload) => {
    useSystemStore.getState().handleTick(payload)
  })

  client.onShutdown((payload: ShutdownPayload) => {
    useSystemStore.getState().handleShutdown(payload)
  })

  // --- 2. 领域业务事件分发 (Domain Events Dispatching) ---
  // A. 聊天流与智能体执行反馈
  client.onChat((payload: ChatPayload) => {
    useChatStore.getState().handleEvent(payload, 'chat')
  })

  // B. 智能体生命周期与核心会话状态
  client.onAgent((payload: AgentEventPayload) => {
    const lifecycleTypes = ['agent:created', 'agent:updated', 'agent:deleted']
    if (lifecycleTypes.includes(payload.type)) {
      useAgentStore.getState().handleLifecycleEvent(payload)
    }

    const runStatusTypes = ['agent:run-start', 'agent:run-end', 'agent:run-error', 'session:reset']
    if (runStatusTypes.includes(payload.type)) {
      useChatStore.getState().handleEvent(payload, 'agent')
    }
  })

  // C. 模型同步事件
  client.onModels((payload: ModelsPayload) => {
    useModelStore.getState().handleModelsUpdate(payload)
  })

  // --- 3. 初始网络建立与激活 (Network Activation) ---
  client.ensureConnected().catch((err) => {
    console.error('[GatewaySync] Critical connection failed:', err)
    useSystemStore.getState().handleError(err)
  })
}
