import type { Handler } from './types.js'
import {
  handleConnect,
  handleHealth,
  handleToolsList,
  handleSkillsList,
  handleBootstrapList,
  handleBootstrapSave,
  handleUsageStats,
  handleConfigGet,
  handleConfigSave
} from './system-handler.js'
import {
  handleAgentList,
  handleAgentCreate,
  handleAgentUpdate,
  handleAgentDelete
} from './agent-handler.js'
import { handleChatSend, handleChatAbort, handleChatHistory } from './chat-handler.js'
import {
  handleSessionsCreate,
  handleSessionsList,
  handleSessionsReset,
  handleSessionsDelete
} from './session-handler.js'
import {
  handleModelsFetch,
  handleModelsAdd,
  handleModelsUpdate,
  handleModelsDelete,
  handleModelsSetDefault,
  handleModelsTest
} from './model-handler.js'

export * from './types.js'

export const handlers: Record<string, Handler> = {
  connect: handleConnect,
  'agent.list': handleAgentList,
  'agent.create': handleAgentCreate,
  'agent.update': handleAgentUpdate,
  'agent.delete': handleAgentDelete,
  'chat.send': handleChatSend,
  'chat.abort': handleChatAbort,
  'chat.history': handleChatHistory,
  'sessions.create': handleSessionsCreate,
  'sessions.list': handleSessionsList,
  'sessions.reset': handleSessionsReset,
  'sessions.delete': handleSessionsDelete,
  'tools.list': handleToolsList,
  'skills.list': handleSkillsList,
  'bootstrap.list': handleBootstrapList,
  'bootstrap.save': handleBootstrapSave,
  'usage.stats': handleUsageStats,
  'config.get': handleConfigGet,
  'config.save': handleConfigSave,
  'models.fetch': handleModelsFetch,
  'models.add': handleModelsAdd,
  'models.update': handleModelsUpdate,
  'models.delete': handleModelsDelete,
  'models.setDefault': handleModelsSetDefault,
  'models.test': handleModelsTest,
  health: handleHealth
}
