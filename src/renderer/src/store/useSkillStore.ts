import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'
import { Skill } from '@shared/types/agent'

export interface SkillCommand {
  name: string
  skillName: string
  description: string
}

interface SkillState {
  skills: Record<string, Skill[]> // Key: agentId
  isLoading: Record<string, boolean> // Key: agentId
  error: string | null
  commands: SkillCommand[]

  // Actions
  fetchCommands: (agentId?: string) => Promise<void>

  // Actions
  fetchSkills: (agentId: string) => Promise<void>
  installSkill: (
    agentId: string,
    target: 'workspace' | 'managed',
    name: string,
    content: string
  ) => Promise<void>
  updateSkill: (agentId: string, name: string, content: string) => Promise<void>
  deleteSkill: (agentId: string, name: string) => Promise<void>
  handleSkillEvent: (payload: any) => void
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: {},
  isLoading: {},
  error: null,
  commands: [],

  fetchCommands: async (agentId) => {
    try {
      const res = await getGatewayClient().request<{ commands: SkillCommand[] }>(
        'skills:commands',
        {
          agentId
        }
      )
      set({ commands: res.commands || [] })
    } catch (err) {
      console.error('[SkillStore] Failed to fetch commands:', err)
    }
  },

  fetchSkills: async (agentId: string) => {
    set((s) => ({
      isLoading: { ...s.isLoading, [agentId]: true },
      error: null
    }))
    try {
      const { skills } = await getGatewayClient().request<{ skills: Skill[] }>('skills:list', {
        agentId
      })
      set((s) => ({
        skills: { ...s.skills, [agentId]: skills || [] },
        isLoading: { ...s.isLoading, [agentId]: false }
      }))
    } catch (err) {
      console.error('[SkillStore] Failed to fetch skills:', err)
      set((s) => ({
        error: String(err),
        isLoading: { ...s.isLoading, [agentId]: false }
      }))
    }
  },

  installSkill: async (agentId, target, name, content) => {
    try {
      await getGatewayClient().request('skills:install', {
        agentId,
        target,
        name,
        content
      })
      await get().fetchSkills(agentId)
    } catch (err) {
      console.error('[SkillStore] Failed to install skill:', err)
      throw err
    }
  },

  updateSkill: async (agentId, name, content) => {
    try {
      await getGatewayClient().request('skills:update', {
        agentId,
        name,
        content
      })
      await get().fetchSkills(agentId)
    } catch (err) {
      console.error('[SkillStore] Failed to update skill:', err)
      throw err
    }
  },

  deleteSkill: async (agentId, name) => {
    try {
      await getGatewayClient().request('skills:delete', {
        agentId,
        name
      })
      await get().fetchSkills(agentId)
    } catch (err) {
      console.error('[SkillStore] Failed to delete skill:', err)
      throw err
    }
  },

  handleSkillEvent: (payload) => {
    // 处理技能生命周期变更
    const types = ['agent:updated', 'agent:skill-triggered']
    if (types.includes(payload.type) && payload.agentId) {
      get().fetchSkills(payload.agentId)
      // skill-triggered 时也刷新命令列表，确保 UI 补全菜单与后端同步
      if (payload.type === 'agent:skill-triggered') {
        get().fetchCommands(payload.agentId)
      }
    }
  }
}))
