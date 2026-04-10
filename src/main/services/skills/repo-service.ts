import axios from 'axios'
import path from 'node:path'
import { extractFrontmatter } from './skill-primitives'
import { ConfigService } from '../config/config-service'
import { PersistentCache } from '../common/persistent-cache'
import { Logger } from '../common/logger'
import { ProxyUtils } from '../common/proxy'

export interface RepoSkill {
  name: string
  path: string // 技能所在目录
  fullPath: string // SKILL.md 文件的真实路径 (用于获取内容，区分大小写)
  description?: string
  sha?: string // 文件的 Git SHA (用于缓存失效校验)
}

interface PersistentCacheEntry {
  name: string
  description: string
  sha: string
  timestamp: number
}

export class SkillRepoService {
  private static instance: SkillRepoService
  private exploreCache: Map<string, { data: RepoSkill[]; timestamp: number }> = new Map()
  private inFlightExplorations: Map<string, Promise<RepoSkill[]>> = new Map()
  private contentCache: Map<string, { data: string; timestamp: number }> = new Map()
  private persistentCache: PersistentCache<PersistentCacheEntry>
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours (In-memory exploration cache TTL)
  private logger = new Logger('SkillRepoService')

  private constructor() {
    const cachePath = path.join(
      ConfigService.getInstance().getRootPath(),
      'skills-market-cache.json'
    )
    this.persistentCache = new PersistentCache<PersistentCacheEntry>(cachePath)
  }

  public static getInstance(): SkillRepoService {
    if (!SkillRepoService.instance) {
      SkillRepoService.instance = new SkillRepoService()
    }
    return SkillRepoService.instance
  }

  /**
   * 获取 Axios 配置 (包含代理和 Headers)
   */
  private getAxiosConfig() {
    const config = ConfigService.getInstance().getConfig()
    const agent = ProxyUtils.createProxyAgent(config.proxy)
    return {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'OPCCLAW-Assistant'
      },
      httpsAgent: agent,
      proxy: false as const // 禁用 axios 自带代理处理，交由 agent 处理
    }
  }

  /**
   * 初始化：预加载配置中的所有技能仓库
   */
  public async initialize(): Promise<void> {
    const config = ConfigService.getInstance().getConfig()
    const repos = config.skillsRepositories || []

    if (repos.length === 0) return

    this.logger.info(`Pre-loading ${repos.length} skills repositories...`)

    // 序列化/交错初始化所有仓库，避免瞬间爆发请求导致 502 或 Rate Limit
    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i]
      // 延迟启动，避免多个仓库同时发起 Tree API 请求
      setTimeout(() => {
        this.exploreRepo(repo.url, repo.branch || 'main').catch((err) => {
          this.logger.error(`Failed to pre-load repo ${repo.url}:`, err.message)
        })
      }, i * 2000) // 2秒间隔
    }
  }

  /**
   * 探索仓库中的技能
   * 使用 Git Tree API 递归获取所有文件，极大提高效率并避免触发 Rate Limit
   */
  async exploreRepo(
    url: string,
    branch: string = 'main',
    forceRefresh = false
  ): Promise<RepoSkill[]> {
    const cacheKey = `${url}:${branch}`
    const now = Date.now()

    if (!forceRefresh) {
      const cached = this.exploreCache.get(cacheKey)
      if (cached && now - cached.timestamp < this.CACHE_TTL) {
        return cached.data
      }

      // 检查是否有正在进行的请求
      const inFlight = this.inFlightExplorations.get(cacheKey)
      if (inFlight) return inFlight
    }

    const explorationPromise = (async (): Promise<RepoSkill[]> => {
      this.logger.info(`Exploring repo: ${url} (branch: ${branch})`)

      const [owner, repo] = url.split('/')
      // 递归获取整个目录树
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`

      try {
        const response = await axios.get(apiUrl, this.getAxiosConfig())

        const tree = response.data.tree as any[]
        const skills: RepoSkill[] = []

        // 1. 找到所有 SKILL.md 文件
        const skillFiles = tree.filter(
          (item: any) =>
            item.type === 'blob' &&
            (item.path.toUpperCase() === 'SKILL.MD' ||
              item.path.toUpperCase().endsWith('/SKILL.MD'))
        )

        this.logger.info(`Found ${skillFiles.length} potential skills in ${url}`)

        // 2. 预初步转换
        for (const file of skillFiles) {
          const pathParts = file.path.split('/')
          let skillName = ''
          let skillDir = ''

          if (pathParts.length === 1) {
            skillName = repo
            skillDir = '.'
          } else {
            skillName = pathParts[pathParts.length - 2]
            skillDir = pathParts.slice(0, -1).join('/')
          }

          skills.push({
            name: skillName,
            path: skillDir,
            fullPath: file.path,
            sha: file.sha,
            description: '' // 初始设为空，稍后异步填充
          })
        }

        // 3. 并发提取元数据 (限制并发以防 Rate Limit)
        // 使用持久化缓存和 SHA 校验，只获取真正更新的文件
        const CONCURRENCY = 20
        const toEnrich: RepoSkill[] = []

        for (const skill of skills) {
          const pCacheKey = `${url}:${branch}:${skill.fullPath}`
          const cached = this.persistentCache.get(pCacheKey)

          if (cached && cached.sha === skill.sha) {
            // 命中缓存且 SHA 未变
            skill.name = cached.name
            skill.description = cached.description
          } else {
            // 需要重新获取
            toEnrich.push(skill)
          }
        }

        if (toEnrich.length > 0) {
          this.logger.info(`Enriching ${toEnrich.length} new/updated skills for ${url}...`)
          for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
            const chunk = toEnrich.slice(i, i + CONCURRENCY)
            await Promise.all(
              chunk.map(async (skill) => {
                try {
                  const content = await this.getSkillContent(url, skill.fullPath, branch)
                  const fm = extractFrontmatter(content)
                  if (fm.name) skill.name = fm.name
                  if (fm.description) skill.description = fm.description

                  // 写入持久化缓存
                  const pCacheKey = `${url}:${branch}:${skill.fullPath}`
                  this.persistentCache.set(pCacheKey, {
                    name: skill.name,
                    description: skill.description || '',
                    sha: skill.sha || '',
                    timestamp: Date.now()
                  })
                } catch (err) {
                  // 失败则保留占位符，不记入持久化缓存
                  skill.description = `Skill from ${url} (${skill.path})`
                }
              })
            )
          }
          // 保存变动到磁盘
          this.persistentCache.save()
        }

        // 存入内存探索缓存
        this.exploreCache.set(cacheKey, { data: skills, timestamp: now })

        return skills
      } catch (err: any) {
        this.logger.error(`Failed to explore repo ${url}:`, err.message)
        throw new Error(`Failed to explore repo: ${err.message}`)
      } finally {
        this.inFlightExplorations.delete(cacheKey)
      }
    })()

    this.inFlightExplorations.set(cacheKey, explorationPromise)
    return explorationPromise
  }

  /**
   * 获取技能内容
   */
  async getSkillContent(
    url: string,
    filePath: string,
    branch: string = 'main',
    forceRefresh = false
  ): Promise<string> {
    const cacheKey = `${url}:${branch}:${filePath}`
    const now = Date.now()

    if (!forceRefresh) {
      const cached = this.contentCache.get(cacheKey)
      if (cached && now - cached.timestamp < this.CACHE_TTL) {
        return cached.data
      }
    }

    const [owner, repo] = url.split('/')
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`

    try {
      const response = await axios.get(rawUrl, this.getAxiosConfig())
      const content = response.data
      this.contentCache.set(cacheKey, { data: content, timestamp: now })
      return content
    } catch (err: any) {
      this.logger.error(`Failed to fetch skill content from ${rawUrl}:`, err.message)
      throw new Error(`Failed to fetch skill content: ${err.message}`)
    }
  }
}
