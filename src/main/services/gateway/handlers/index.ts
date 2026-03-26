import type { Handler } from './types'
import {
  handleConnect,
  handleHealth,
  handleToolsList,
  handleSkillsList,
  handleBootstrapList,
  handleBootstrapSave,
  handleUsageStats,
  handleConfigGet,
  handleConfigSave,
  handleEventsDoc
} from './system-handler'
import {
  handleHeartbeatList,
  handleHeartbeatUpdate,
  handleHeartbeatTrigger,
  handleHeartbeatSaveFile,
  handleHeartbeatDeleteFile,
  handleHeartbeatGetFile,
  handleHeartbeatLogs
} from './heartbeat-handler'
import {
  handleAgentList,
  handleAgentCreate,
  handleAgentUpdate,
  handleAgentDelete
} from './agent-handler'
import {
  handleChatSend,
  handleChatAbort,
  handleChatHistory,
  handleChatRespondInteraction
} from './chat-handler'
import {
  handleSessionsCreate,
  handleSessionsList,
  handleSessionsReset,
  handleSessionsDelete
} from './session-handler'
import {
  handleModelsFetch,
  handleModelsAdd,
  handleModelsUpdate,
  handleModelsDelete,
  handleModelsSetDefault,
  handleModelsTest
} from './model-handler'

export * from './types'

export const handlers: Record<string, Handler> = {
  connect: handleConnect,
  'agent:list': handleAgentList,
  'agent:create': handleAgentCreate,
  'agent:update': handleAgentUpdate,
  'agent:delete': handleAgentDelete,
  'chat:send': handleChatSend,
  'chat:abort': handleChatAbort,
  'chat:history': handleChatHistory,
  'chat:respondInteraction': handleChatRespondInteraction,
  'sessions:create': handleSessionsCreate,
  'sessions:list': handleSessionsList,
  'sessions:reset': handleSessionsReset,
  'sessions:delete': handleSessionsDelete,
  'tools:list': handleToolsList,
  'skills:list': handleSkillsList,
  'bootstrap:list': handleBootstrapList,
  'bootstrap:save': handleBootstrapSave,
  'usage:stats': handleUsageStats,
  'config:get': handleConfigGet,
  'config:save': handleConfigSave,
  'system:events-doc': handleEventsDoc,
  'models:fetch': handleModelsFetch,
  'models:add': handleModelsAdd,
  'models:update': handleModelsUpdate,
  'models:delete': handleModelsDelete,
  'models:setDefault': handleModelsSetDefault,
  'models:test': handleModelsTest,
  'heartbeat:list': handleHeartbeatList,
  'heartbeat:update': handleHeartbeatUpdate,
  'heartbeat:trigger': handleHeartbeatTrigger,
  'heartbeat:save-file': handleHeartbeatSaveFile,
  'heartbeat:delete-file': handleHeartbeatDeleteFile,
  'heartbeat:get-file': handleHeartbeatGetFile,
  'heartbeat:logs': handleHeartbeatLogs,
  health: handleHealth
}
