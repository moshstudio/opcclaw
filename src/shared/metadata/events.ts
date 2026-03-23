/**
 * 后端网关事件对接文档元数据
 *
 * 此文件定义了所有从后端推送到前端的事件类型、频道及负载结构。
 */

export interface EventDoc {
  channel: string
  type: string
  description: string
  payload: any
  category: 'chat' | 'agent' | 'models' | 'system' | 'config'
}

export const GATEWAY_EVENTS_DOC: EventDoc[] = [
  // --- CHAT 频道 ---
  {
    channel: 'chat',
    type: 'chat:start',
    description: 'AI 开始生成回复',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      chunkId: 'string',
      parentId: 'string',
      state: 'start',
      message: 'Message'
    }
  },
  {
    channel: 'chat',
    type: 'chat:delta',
    description: 'AI 增量生成文本内容',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      chunkId: 'string',
      parentId: 'string',
      state: 'delta',
      delta: 'string'
    }
  },
  {
    channel: 'chat',
    type: 'chat:thinking',
    description: 'AI 思考过程的增量输出',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      chunkId: 'string',
      parentId: 'string',
      state: 'thinking',
      delta: 'string'
    }
  },
  {
    channel: 'chat',
    type: 'chat:final',
    description: 'AI 完成回复生成',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      chunkId: 'string',
      parentId: 'string',
      state: 'final',
      message: 'Message',
      usage: 'Usage'
    }
  },
  {
    channel: 'chat',
    type: 'chat:toolCall',
    description: 'AI 触发工具调用',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      chunkId: 'string',
      parentId: 'string',
      state: 'toolCall',
      toolCall: { id: 'string', name: 'string', arguments: 'any' }
    }
  },
  {
    channel: 'chat',
    type: 'chat:toolResult',
    description: '工具执行结果返回给 AI',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      chunkId: 'string',
      parentId: 'string',
      state: 'toolResult',
      toolResult: { toolCallId: 'string', toolName: 'string', content: 'any[]', isError: 'boolean' }
    }
  },
  {
    channel: 'chat',
    type: 'chat:planning',
    description: 'AI 正在规划后续任务步骤',
    category: 'chat',
    payload: { sessionKey: 'string', state: 'planning', delta: 'string' }
  },
  {
    channel: 'chat',
    type: 'chat:subagentFeedback',
    description: '子智能体执行反馈',
    category: 'chat',
    payload: {
      sessionKey: 'string',
      state: 'subagentFeedback',
      subagent: {
        task: 'string',
        summary: 'string',
        childSessionKey: 'string'
      }
    }
  },

  // --- AGENT 频道 ---
  {
    channel: 'agent',
    type: 'agent:created',
    description: '新智能体被创建',
    category: 'agent',
    payload: { agentId: 'string' }
  },
  {
    channel: 'agent',
    type: 'agent:updated',
    description: '智能体配置被更新',
    category: 'agent',
    payload: { agentId: 'string' }
  },
  {
    channel: 'agent',
    type: 'agent:deleted',
    description: '智能体被删除',
    category: 'agent',
    payload: { agentId: 'string' }
  },
  {
    channel: 'session:created',
    description: '新会话会话被初始化',
    category: 'agent',
    type: 'session:created',
    payload: { agentId: 'string', sessionKey: 'string' }
  },
  {
    channel: 'session:reset',
    description: '会话被重置（清空上下文）',
    category: 'agent',
    type: 'session:reset',
    payload: { sessionKey: 'string' }
  },

  // --- MODELS 频道 ---
  {
    channel: 'models',
    type: 'models:list',
    description: '返回可用模型列表',
    category: 'models',
    payload: { models: 'Model[]', defaultModelId: 'string | null' }
  },

  // --- SYSTEM 频道 ---
  {
    channel: 'system',
    type: 'system:tick',
    description: '后端心跳包（每秒）',
    category: 'system',
    payload: { ts: 'number' }
  },
  {
    channel: 'system',
    type: 'system:shutdown',
    description: '后端正在关闭通知',
    category: 'system',
    payload: { reason: 'string', restartExpectedMs: 'number | null' }
  },

  // --- CONFIG 频道 ---
  {
    channel: 'config',
    type: 'config:saved',
    description: '系统配置文件已保存',
    category: 'config',
    payload: { path: 'string' }
  }
]
