/**
 * 后端网关事件对接文档元数据
 *
 * 此文件定义了所有从客户端发起的请求方法以及从后端推送到前端的事件类型。
 */

export interface ParamDoc {
  name: string
  type: string
  description: string
  optional?: boolean
}

export interface MethodDoc {
  method: string
  description: string
  params: ParamDoc[] | string // 可以是参数列表或描述字符串
  result: any
  category:
    | 'chat'
    | 'agent'
    | 'session'
    | 'models'
    | 'system'
    | 'config'
    | 'heartbeat'
    | 'skill'
    | 'tool'
}

export interface EventDoc {
  channel: string
  type: string
  description: string
  payload: any
  category: 'chat' | 'agent' | 'models' | 'system' | 'config' | 'heartbeat' | 'session'
}

/**
 * 客户端请求方法文档 (Requests)
 */
export const GATEWAY_METHODS_DOC: MethodDoc[] = [
  // --- CHAT ---
  {
    method: 'chat:send',
    description: '发送对话消息，启动 AI 推理流程',
    category: 'chat',
    params: [
      { name: 'agentId', type: 'string', description: '目标智能体 ID' },
      { name: 'sessionKey', type: 'string', description: '会话唯一标识' },
      { name: 'message', type: 'string', description: '用户输入文本' }
    ],
    result: { runId: 'string' }
  },
  {
    method: 'chat:abort',
    description: '中断当前的对话生成任务',
    category: 'chat',
    params: [{ name: 'runId', type: 'string', description: '要中断的任务 ID' }],
    result: 'void'
  },
  {
    method: 'chat:history',
    description: '获取会话的历史消息记录',
    category: 'chat',
    params: [
      { name: 'agentId', type: 'string', description: '智能体 ID' },
      { name: 'sessionKey', type: 'string', description: '会话 Key' },
      { name: 'limit', type: 'number', description: '分页限制', optional: true },
      { name: 'offset', type: 'number', description: '分页偏移', optional: true }
    ],
    result: { messages: 'Message[]' }
  },
  {
    method: 'chat:respondInteraction',
    description: '响应 AI 触发的交互请求（如人工确认、选择等）',
    category: 'chat',
    params: [
      { name: 'agentId', type: 'string', description: '智能体 ID' },
      { name: 'interactionId', type: 'string', description: '交互 ID' },
      { name: 'result', type: 'boolean', description: '响应结果' },
      { name: 'remember', type: 'boolean', description: '是否记住选择' }
    ],
    result: 'void'
  },

  // --- AGENT ---
  {
    method: 'agent:list',
    description: '获取所有可用的智能体列表',
    category: 'agent',
    params: 'void',
    result: { agents: 'Agent[]' }
  },
  {
    method: 'agent:create',
    description: '创建一个新的智能体',
    category: 'agent',
    params: [{ name: 'config', type: 'Partial<Agent>', description: '智能体配置对象' }],
    result: 'Agent'
  },
  {
    method: 'agent:update',
    description: '更新指定智能体的配置',
    category: 'agent',
    params: [
      { name: 'agentId', type: 'string', description: '智能体 ID' },
      { name: 'config', type: 'Partial<Agent>', description: '新的配置项' }
    ],
    result: 'Agent'
  },
  {
    method: 'agent:delete',
    description: '删除指定的智能体',
    category: 'agent',
    params: [{ name: 'agentId', type: 'string', description: '智能体 ID' }],
    result: 'void'
  },

  // --- SESSION ---
  {
    method: 'sessions:create',
    description: '为指定智能体创建新会话',
    category: 'session',
    params: [{ name: 'agentId', type: 'string', description: '智能体 ID' }],
    result: { sessionKey: 'string' }
  },
  {
    method: 'sessions:list',
    description: '列出指定智能体的所有会话 Key',
    category: 'session',
    params: [{ name: 'agentId', type: 'string', description: '智能体 ID' }],
    result: { sessionKeys: 'string[]' }
  },
  {
    method: 'sessions:reset',
    description: '重置并清空会话上下文',
    category: 'session',
    params: [
      { name: 'agentId', type: 'string', description: '智能体 ID' },
      { name: 'sessionKey', type: 'string', description: '会话 Key' }
    ],
    result: 'void'
  },
  {
    method: 'sessions:delete',
    description: '删除指定的会话',
    category: 'session',
    params: [
      { name: 'agentId', type: 'string', description: '智能体 ID' },
      { name: 'sessionKey', type: 'string', description: '会话 Key' }
    ],
    result: 'void'
  },

  // --- MODELS ---
  {
    method: 'models:fetch',
    description: '全量同步/刷新模型列表',
    category: 'models',
    params: 'void',
    result: 'void'
  },
  {
    method: 'models:add',
    description: '手动添加一个模型配置',
    category: 'models',
    params: [{ name: 'model', type: 'AIModelConfig', description: '模型配置对象' }],
    result: 'void'
  },
  {
    method: 'models:update',
    description: '更新模型配置项',
    category: 'models',
    params: [{ name: 'model', type: 'AIModelConfig', description: '新的配置项' }],
    result: 'void'
  },
  {
    method: 'models:delete',
    description: '删除指定模型',
    category: 'models',
    params: [{ name: 'modelId', type: 'string', description: '模型 ID' }],
    result: 'void'
  },
  {
    method: 'models:setDefault',
    description: '设置系统的默认主选模型',
    category: 'models',
    params: [{ name: 'modelId', type: 'string', description: '模型 ID' }],
    result: 'void'
  },
  {
    method: 'models:test',
    description: '测试模型 API 连通性（延迟、可用性）',
    category: 'models',
    params: [{ name: 'modelId', type: 'string', description: '模型 ID' }],
    result: 'void'
  },
  {
    method: 'models:providers',
    description: '获取当前系统支持的模型供应商列表 (如 OpenAI, Ollama 等)',
    category: 'models',
    params: 'void',
    result: 'string[]'
  },

  // --- SKILLS & TOOLS ---
  {
    method: 'tools:list',
    description: '获取系统当前加载的所有工具 (Tools) 规格',
    category: 'tool',
    params: 'void',
    result: { tools: 'unknown[]' }
  },
  {
    method: 'skills:list',
    description: '获取已安装的 Skill 技能插件列表',
    category: 'skill',
    params: 'void',
    result: { skills: 'unknown[]' }
  },
  {
    method: 'skills:install',
    description: '安装一个新的本地技能插件',
    category: 'skill',
    params: [{ name: 'name', type: 'string', description: '技能名称' }],
    result: 'void'
  },
  {
    method: 'skills:delete',
    description: '卸载/删除指定的技能插件',
    category: 'skill',
    params: [{ name: 'name', type: 'string', description: '技能名称' }],
    result: 'void'
  },

  // --- HEARTBEAT ---
  {
    method: 'heartbeat:trigger',
    description: '手动立即触发智能体的离线心跳任务',
    category: 'heartbeat',
    params: [{ name: 'agentId', type: 'string', description: '智能体 ID' }],
    result: 'void'
  },
  {
    method: 'heartbeat:logs',
    description: '获取智能体心跳任务的实时执行日志',
    category: 'heartbeat',
    params: [{ name: 'agentId', type: 'string', description: '智能体 ID' }],
    result: 'any'
  },
  {
    method: 'heartbeat:get-file',
    description: '读取该智能体关联的 Heartbeat 指令文件内容',
    category: 'heartbeat',
    params: [{ name: 'agentId', type: 'string', description: '智能体 ID' }],
    result: { content: 'string' }
  },
  {
    method: 'heartbeat:save-file',
    description: '保存/重写 Heartbeat 指令脚本',
    category: 'heartbeat',
    params: [
      { name: 'agentId', type: 'string', description: '智能体 ID' },
      { name: 'content', type: 'string', description: '文件内容' }
    ],
    result: 'void'
  },

  // --- SYSTEM & CONFIG ---
  {
    method: 'config:get',
    description: '获取后端网关系统的全局配置',
    category: 'config',
    params: 'void',
    result: 'unknown'
  },
  {
    method: 'config:save',
    description: '持久化保存配置更新',
    category: 'config',
    params: [{ name: 'config', type: 'unknown', description: '全量或增量配置包' }],
    result: 'void'
  },
  {
    method: 'connect',
    description: '网关握手认证请求',
    category: 'system',
    params: [
      { name: 'token', type: 'string', description: '访问令牌', optional: true },
      { name: 'nonce', type: 'string', description: '由服务端提供的挑战随机数', optional: true }
    ],
    result: 'HelloOk'
  },
  {
    method: 'health',
    description: '监控网关底层运行指标',
    category: 'system',
    params: 'void',
    result: { uptimeMs: 'number', clients: 'number', system: 'string' }
  },
  {
    method: 'usage:stats',
    description: '获取全系统/所有 Agent 的 Token 消耗历史概览',
    category: 'system',
    params: 'void',
    result: 'unknown'
  }
]

/**
 * 后端推送事件文档 (Server-To-Client Events)
 */
export const GATEWAY_EVENTS_DOC: EventDoc[] = [
  // --- CHAT ---
  {
    channel: 'chat',
    type: 'chat:start',
    description: 'AI 开始生成回复（流式传输起点）',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      messageId: 'string',
      message: 'Message'
    }
  },
  {
    channel: 'chat',
    type: 'chat:delta',
    description: 'AI 正式回答内容的流式增量输出',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      delta: 'string',
      messageId: 'string'
    }
  },
  {
    channel: 'chat',
    type: 'chat:thinking',
    description: 'AI 思考过程（Thought/Reasoning）的流式增量输出',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      delta: 'string',
      messageId: 'string'
    }
  },
  {
    channel: 'chat',
    type: 'chat:toolCall',
    description: 'AI 请求执行外部工具调用',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      toolCallId: 'string',
      toolName: 'string',
      arguments: 'Record<string, any>'
    }
  },
  {
    channel: 'chat',
    type: 'chat:toolResult',
    description: '工具执行结束，结果推送到该通道',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      toolCallId: 'string',
      toolName: 'string',
      content: 'any',
      isError: 'boolean'
    }
  },
  {
    channel: 'chat',
    type: 'chat:interaction',
    description: 'AI 触发一个等待用户介入的交互任务',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      interactionId: 'string',
      prompt: 'string',
      options: 'string[]'
    }
  },
  {
    channel: 'chat',
    type: 'chat:final',
    description: 'AI 回复生成全部结束，返回最终完整包',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      message: 'Message',
      usage: 'Usage',
      performance: 'AgentPerformance'
    }
  },
  {
    channel: 'chat',
    type: 'chat:error',
    description: '会话过程中发生非预期错误',
    category: 'chat',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      error: 'string'
    }
  },

  // --- AGENT ---
  {
    channel: 'agent',
    type: 'agent:run-start',
    description: '智能体工作流整体开始启动',
    category: 'agent',
    payload: { agentId: 'string', sessionKey: 'string', runId: 'string', model: 'string' }
  },
  {
    channel: 'agent',
    type: 'agent:run-end',
    description: '智能体工作流整体运行结束',
    category: 'agent',
    payload: {
      agentId: 'string',
      sessionKey: 'string',
      runId: 'string',
      messages: 'Message[]',
      usage: 'Usage'
    }
  },
  {
    channel: 'agent',
    type: 'agent:skill-triggered',
    description: '特定的 Skill 技能被激活',
    category: 'agent',
    payload: { agentId: 'string', sessionKey: 'string', runId: 'string', skillName: 'string' }
  },

  // --- SESSION ---
  {
    channel: 'session:created',
    type: 'session:created',
    description: '新会话创建成功',
    category: 'session',
    payload: { agentId: 'string', sessionKey: 'string' }
  },

  // --- HEARTBEAT ---
  {
    channel: 'heartbeat',
    type: 'heartbeat:triggered',
    description: '离线心跳任务触发执行通知',
    category: 'heartbeat',
    payload: { agentId: 'string', status: 'HeartbeatTaskStatus' }
  },

  // --- MODELS ---
  {
    channel: 'models',
    type: 'models:list',
    description: '受控模型列表发生变化或初始加载完成',
    category: 'models',
    payload: { models: 'AIModelConfig[]', defaultModelId: 'string | null' }
  },

  // --- SYSTEM ---
  {
    channel: 'system',
    type: 'system:tick',
    description: '服务端定时同步的时间戳（心跳驱动）',
    category: 'system',
    payload: { ts: 'number' }
  },
  {
    channel: 'system',
    type: 'system:shutdown',
    description: '服务端系统即将关闭或重启告警',
    category: 'system',
    payload: { reason: 'string', restartExpectedMs: 'number | null' }
  },

  // --- CONFIG ---
  {
    channel: 'config',
    type: 'config:saved',
    description: '全局或网关相关配置已完成持久化',
    category: 'config',
    payload: { path: 'string' }
  }
]

/**
 * 核心业务对象文档 (Common Objects)
 */
export const GATEWAY_COMMON_TYPES_DOC = [
  {
    name: 'Message',
    description: '对话消息对象，包含用户输入或 AI 的回复内容。',
    model: {
      role: 'user | assistant | tool',
      content: 'string | ContentBlock[]',
      timestamp: 'number | string',
      usage: 'Usage (可选)',
      performance: 'AgentPerformance (可选)'
    }
  },
  {
    name: 'ContentBlock',
    description: '消息内容的最小单元块。',
    model: {
      type: 'text | thinking | toolCall | toolResult | image | subagent',
      text: 'string (仅 text/thinking)',
      delta: 'string (仅流式输出时)',
      toolCallId: 'string (仅 tool 相关)',
      toolName: 'string (仅 tool 相关)'
    }
  },
  {
    name: 'Agent',
    description: '智能体完整定义配置。',
    model: {
      id: 'string',
      config: {
        name: 'string',
        description: 'string',
        modelId: 'string',
        systemPrompt: 'string',
        enableMemory: 'boolean'
      }
    }
  },
  {
    name: 'Usage',
    description: '模型 Token 消耗统计。',
    model: {
      promptTokens: 'number',
      completionTokens: 'number',
      totalTokens: 'number'
    }
  },
  {
    name: 'AgentPerformance',
    description: '推理性能指标。',
    model: {
      totalDurationMs: 'number',
      firstTokenLatencyMs: 'number',
      throughput: 'number (tokens/s)'
    }
  }
]
