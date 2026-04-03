import { getGatewayClient } from '@renderer/services/gateway-client'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useModelStore } from '@renderer/store/useModelStore'
import { useSystemStore } from '@renderer/store/useSystemStore'
import { useHeartbeatStore } from '@renderer/store/useHeartbeatStore'
import { useSkillStore } from '@renderer/store/useSkillStore'
import { useConfigStore } from '@renderer/store/useConfigStore'
import type { ChatPayload, EventPayloadMap } from '@shared/types/gateway'

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
  const syncInitialData = async () => {
    useSystemStore.getState().setInitializing(true) // 开启全局初始化加载状态 (LoadingScreen)
    useSystemStore.getState().handleConnect()

    try {
      // 1. 优先加载并校准智能体列表
      await useAgentStore.getState().fetchAgents()

      // 2. 触发其他领域的基础数据加载
      await Promise.all([
        useHeartbeatStore.getState().fetchHeartbeatTasks(),
        useModelStore.getState().fetchModels({ silent: true }),
        useConfigStore.getState().fetchConfig()
      ])

      // 3. 此时获取的 activeAgentId 已经是经过校准的
      const activeAgentId = useAgentStore.getState().activeAgentId
      if (activeAgentId) {
        await Promise.all([
          useChatStore.getState().fetchSessions(activeAgentId),
          useSkillStore.getState().fetchSkills(activeAgentId)
        ])
      }
    } finally {
      // 无论成功还是部分失败，都关闭初始化遮罩，让用户可以操作 UI
      useSystemStore.getState().setInitializing(false)
    }
  }

  client.onConnect(syncInitialData)

  client.onClose(() => {
    useSystemStore.getState().handleDisconnect()
  })

  client.onTick((payload: EventPayloadMap['system:tick']) => {
    useSystemStore.getState().handleTick(payload)
  })

  client.onShutdown((payload: EventPayloadMap['system:shutdown']) => {
    useSystemStore.getState().handleShutdown(payload)
  })

  // --- 2. 领域业务事件分发 (Domain Events Dispatching) ---
  // A. 聊天流与智能体执行反馈
  client.onChat((payload: ChatPayload) => {
    useChatStore.getState().handleChatEvent(payload)
  })

  // B. 业务通知独立频道
  client.onNotice((payload) => {
    useChatStore.getState().handleNoticeEvent(payload)
  })

  // B. 智能体领域事件 (包含生命周期与运行态)
  client.onAgent((payload) => {
    // 处理生命周期与运行态分发
    useAgentStore.getState().handleLifecycleEvent?.(payload)
    useChatStore.getState().handleAgentEvent(payload)
    useSkillStore.getState().handleSkillEvent(payload)
  })

  // C. 会话领域事件 (创建、重置、删除)
  client.onSession((payload) => {
    useChatStore.getState().handleSessionEvent(payload)
  })

  client.onHeartbeat((payload) => {
    useHeartbeatStore.getState().handleHeartbeatEvent(payload)
  })

  // D. 模型与配置领域同步
  client.onModel((payload) => {
    if (payload.type === 'models:list') {
      // 1. 更新专用模型仓
      useModelStore.getState().handleModelsUpdate(payload)

      // 2. 更新基础配置仓，防止回滚 (Single Source of Truth Protection)
      const currentConfig = useConfigStore.getState().config
      if (currentConfig) {
        useConfigStore.setState({
          config: {
            ...currentConfig,
            models: payload.models,
            defaultModelId: payload.defaultModelId
          }
        })
      }
    }
  })

  // E. 配置领域同步 (由主进程触发广播)
  client.onConfig(() => {
    useConfigStore.getState().fetchConfig()
  })

  // --- 3. 初始网络建立与激活 (Network Activation) ---
  client.ensureConnected().catch((err) => {
    console.error('[GatewaySync] Critical connection failed:', err)
    useSystemStore.getState().handleError(err)
  })
}
