export interface AgentSettingsFormData {
  name: string
  systemPrompt: string
  modelSelectId: string
  temperature: number
  reasoning: string
  contextTokens: number
  enableMemory: boolean
  enableSkills: boolean
  enableContext: boolean
  enableHeartbeat: boolean
  workspaceDir: string
  maxTurns: number
  maxTokens: number
  maxConcurrentRuns: number
  sandboxEnabled: boolean
  sandboxAllowExec: boolean
  sandboxAllowWrite: boolean
  isPinned: boolean
  toolPolicy?: {
    allow?: string[]
    deny?: string[]
  }
}

export interface SettingsSectionProps {
  formData: AgentSettingsFormData
  setFormData: React.Dispatch<React.SetStateAction<AgentSettingsFormData>>
  isOpen: boolean
  onToggle: () => void
}
