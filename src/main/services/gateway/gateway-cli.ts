#!/usr/bin/env node
/**
 * Gateway CLI 入口
 *
 * 对齐 OpenClaw:
 * - cli/gateway-cli.ts → gateway run / gateway status
 * - 两种模式: serve（启动服务）/ connect（连接客户端）
 *
 * 用法:
 *   tsx src/gateway/gateway-cli.ts serve [--port 18781] [--token xxx]
 *   tsx src/gateway/gateway-cli.ts connect [--url ws://...] [--token xxx]
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Agent } from '@main/services/agent/agent'
import { getEnvApiKey } from '@mariozechner/pi-ai'
import { startGatewayServer } from './server'
import { GatewayClient } from './client'
import { AgentRegistry } from '@main/services/agent/registry'
import type { EventFrame } from './protocol'
import { AgentConfig } from '@shared/types/agent'
import { LogLevel } from '@shared/types/logger'

// ============== .env ==============

function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), '.env')
  let content: string
  try {
    content = fs.readFileSync(envPath, 'utf-8')
  } catch {
    return
  }
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const val = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}
loadEnvFile()

// ============== 参数解析 ==============

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const args = process.argv.slice(2)
const mode = args[0] ?? 'serve'

// ============== serve 模式 ==============

async function serve() {
  const port = Number(flag(args, '--port') ?? 18781)
  const token = flag(args, '--token') ?? process.env.OPENCLAW_MINI_GW_TOKEN
  const provider = flag(args, '--provider') ?? process.env.OPENCLAW_MINI_PROVIDER ?? 'anthropic'
  const model = flag(args, '--model') ?? process.env.OPENCLAW_MINI_MODEL
  const baseUrl = flag(args, '--base-url') ?? process.env.OPENCLAW_MINI_BASE_URL
  const apiKey = flag(args, '--api-key') ?? getEnvApiKey(provider)

  if (!apiKey) {
    console.error('Error: API key not found')
    process.exit(1)
  }

  const config: AgentConfig = {
    name: 'Main Agent',
    apiKey,
    provider,
    agentId: 'main',
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl } : {})
  }
  const agent = new Agent(config)

  const registry = AgentRegistry.getInstance()
  registry.registerAgent('main', agent, config)

  const logLevel = (flag(args, '--log-level') as LogLevel) || 'info'

  const gw = await startGatewayServer({ port, token, registry, logLevel })

  console.log(`\n\x1b[36m\u25cf\x1b[0m \x1b[1mMini Gateway\x1b[0m`)
  console.log(`\x1b[2m  ws://localhost:${gw.port}\x1b[0m`)
  console.log(`\x1b[2m  ${provider}${model ? ` · ${model}` : ''}\x1b[0m`)
  console.log(`\x1b[2m  token: ${token ? '***' : '(none)'}\x1b[0m`)
  console.log(`\x1b[2m  Ctrl+C to stop\x1b[0m\n`)

  process.on('SIGINT', () => {
    gw.close()
    console.log('\nBye!')
    process.exit(0)
  })
}

// ============== connect 模式 ==============

async function connect() {
  const url = flag(args, '--url') ?? 'ws://localhost:18781'
  const token = flag(args, '--token') ?? process.env.OPENCLAW_MINI_GW_TOKEN
  const sessionKey = flag(args, '--session') ?? 'main'

  // 事件驱动 prompt：chat.final / chat.error 后重新显示输入提示
  let showPrompt: (() => void) | null = null

  const client = new GatewayClient({
    url,
    token,
    autoReconnect: false, // CLI 模式不自动重连，手动控制
    onEvent: (evt: EventFrame) => {
      const p = evt.payload as {
        state?: string
        text?: string
        error?: string
        delta?: string
        type?: string
        toolName?: string
        reason?: string
        restartExpectedMs?: number | null
      }
      if (evt.event === 'chat:delta') {
        process.stdout.write(p.delta ?? '')
      } else if (evt.event === 'chat:final') {
        process.stdout.write('\n')
        showPrompt?.()
      } else if (evt.event === 'chat:error') {
        console.error(`\x1b[33m  error: ${p.error}\x1b[0m`)
        showPrompt?.()
      } else if (evt.event === 'chat:toolCall') {
        console.log(`\x1b[2m  ● ${p.toolName}\x1b[0m`)
      } else if (evt.event === 'system:tick') {
        // 心跳，静默
      } else if (evt.event === 'system:shutdown') {
        const hint = p.restartExpectedMs
          ? ` (restart in ~${Math.round(p.restartExpectedMs / 1000)}s)`
          : ''
        console.log(`\x1b[2m  server shutting down${hint}\x1b[0m`)
      }
    },
    onClose: (_code, _reason) => {
      console.log('\x1b[2m  disconnected\x1b[0m')
      process.exit(0)
    }
  })

  try {
    const hello = await client.connect()
    console.log(`\n\x1b[36m\u25cf\x1b[0m \x1b[1mConnected\x1b[0m`)
    console.log(`\x1b[2m  protocol: v${hello.protocol}\x1b[0m`)
    console.log(`\x1b[2m  methods: ${hello.methods.join(', ')}\x1b[0m`)
    console.log(`\x1b[2m  session: ${sessionKey}\x1b[0m\n`)
  } catch (err) {
    console.error(`Connection failed: ${(err as Error).message}`)
    process.exit(1)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const prompt = () => {
    rl.question('\x1b[32m\u276f\x1b[0m ', async (input) => {
      const trimmed = input.trim()
      if (!trimmed) {
        prompt()
        return
      }
      if (trimmed === '/quit') {
        client.close()
        return
      }
      if (trimmed === '/health') {
        const h = await client.request('health')
        console.log(h)
        prompt()
        return
      }
      if (trimmed === '/sessions') {
        const s = await client.request('sessions:list')
        console.log(s)
        prompt()
        return
      }
      if (trimmed === '/tools') {
        const toolsRes = await client.request<{ tools: { name: string; description: string }[] }>(
          'tools:list'
        )
        console.log(toolsRes.tools)
        prompt()
        return
      }
      if (trimmed === '/skills') {
        const skillsRes = await client.request<{ skills: { name: string; path: string }[] }>(
          'skills:list',
          { agentId: sessionKey }
        )
        console.log(skillsRes.skills)
        prompt()
        return
      }

      try {
        await client.request('chat:send', { sessionKey, message: trimmed })
      } catch (err) {
        console.error(`\x1b[33m  ${(err as Error).message}\x1b[0m`)
        prompt()
      }
      // prompt 由 onEvent chat.final/error 回调触发
    })
  }

  showPrompt = prompt
  prompt()
  process.on('SIGINT', () => {
    client.close()
    process.exit(0)
  })
}

// ============== 入口 ==============

if (mode === 'connect') {
  connect()
} else {
  serve()
}
