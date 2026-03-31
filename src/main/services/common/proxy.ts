import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'

/**
 * 代理配置转换工具
 */
export class ProxyUtils {
  /**
   * 根据代理字符串创建对应的 Agent
   * @param proxyUrl 代理地址，例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:7890
   */
  static createProxyAgent(proxyUrl?: string): HttpsProxyAgent | SocksProxyAgent | undefined {
    if (!proxyUrl) return undefined

    try {
      if (proxyUrl.startsWith('socks')) {
        return new SocksProxyAgent(proxyUrl)
      }
      return new HttpsProxyAgent(proxyUrl)
    } catch (err) {
      console.error(`[ProxyUtils] Failed to create proxy agent for ${proxyUrl}:`, err)
      return undefined
    }
  }

  /**
   * 获取 grammy 客户端所需的 baseFetchConfig
   */
  static getBaseFetchConfig(proxyUrl?: string) {
    const agent = this.createProxyAgent(proxyUrl)
    if (!agent) return { compress: true }

    return {
      agent,
      compress: true
    }
  }
}
