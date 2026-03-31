import { getGatewayClient } from '@renderer/services/gateway-client'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useModelStore } from '@renderer/store/useModelStore'
import { useSystemStore } from '@renderer/store/useSystemStore'
import { useHeartbeatStore } from '@renderer/store/useHeartbeatStore'
import { useSkillStore } from '@renderer/store/useSkillStore'
import { useConfigStore } from '@renderer/store/useConfigStore'
import {
  ChatPayload,
  AgentEventPayload,
  ModelsPayload,
  TickPayload,
  ShutdownPayload,
  NoticePayload
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
  const syncInitialData = () => {
    useSystemStore.getState().handleConnect()

    // 连接成功（含重连成功）后，触发各领域的基础数据加载与同步
    useAgentStore.getState().fetchAgents()
    useHeartbeatStore.getState().fetchHeartbeatTasks()
    useModelStore.getState().fetchModels()
    useConfigStore.getState().fetchConfig()

    // 如果有活跃 Agent，刷新其会话数据
    const activeAgentId = useAgentStore.getState().activeAgentId
    if (activeAgentId) {
      useChatStore.getState().fetchSessions(activeAgentId)
      useSkillStore.getState().fetchSkills(activeAgentId)
    }
  }

  client.onConnect(syncInitialData)

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
    useChatStore.getState().handleChatEvent(payload)
  })

  // B. 业务通知独立频道
  client.onNotice((payload: NoticePayload) => {
    useChatStore.getState().handleNoticeEvent(payload)
  })

  // B. 智能体领域事件 (包含生命周期与运行态)
  client.onAgent((payload: AgentEventPayload) => {
    // 1. 同步到全局智能体列表 Store
    useAgentStore.getState().handleLifecycleEvent?.(payload)
    // 2. 同步到各个会话的状态 Store (状态机逻辑已在 agent-handler 中解耦)
    useChatStore.getState().handleAgentEvent(payload)
    // 3. 辅助分发给技能领域
    useSkillStore.getState().handleSkillEvent(payload)
  })

  // C. 会话领域事件 (创建、重置、删除)
  client.onSession((payload: AgentEventPayload) => {
    // 处理会话级变更事件 (逻辑已在 session-handler 中解耦)
    useChatStore.getState().handleSessionEvent(payload)
  })

  // C. 模型同步事件
  client.onModels((payload: ModelsPayload) => {
    useModelStore.getState().handleModelsUpdate(payload)
  })

  // D. 心跳任务事件
  client.onHeartbeat((payload) => {
    useHeartbeatStore.getState().handleHeartbeatEvent(payload)
  })

  // --- 3. 初始网络建立与激活 (Network Activation) ---
  client.ensureConnected().catch((err) => {
    console.error('[GatewaySync] Critical connection failed:', err)
    useSystemStore.getState().handleError(err)
  })
}
