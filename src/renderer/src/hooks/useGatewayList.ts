import { useState, useEffect, useCallback } from 'react'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { GatewayMethod } from '@shared/types/gateway'

interface UseGatewayListOptions<P> {
  method: GatewayMethod
  params?: P
  autoFetch?: boolean
  refreshDeps?: any[]
}

export function useGatewayList<T, P = any>(options: UseGatewayListOptions<P>) {
  const { method, params, autoFetch = true, refreshDeps = [] } = options
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const client = getGatewayClient()
      const res = await client.request<any>(method as any, params)
      // Standardize response extraction (e.g., res.skills or res.tools)
      const key = method.split(':')[0]
      setData(res[key] || [])
    } catch (err) {
      console.error(`Failed to fetch ${method}:`, err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [method, JSON.stringify(params)])

  useEffect(() => {
    if (autoFetch) {
      fetchData()
    }
  }, [fetchData, autoFetch, ...refreshDeps]) // Only re-fetch if method or deps change

  return { data, setData, loading, error, refresh: fetchData }
}
