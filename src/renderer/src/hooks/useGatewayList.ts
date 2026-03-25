import { useState, useEffect, useCallback } from 'react'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { GatewayMethod } from '@shared/types/gateway'

interface UseGatewayListOptions<P> {
  method: GatewayMethod
  params?: P
  autoFetch?: boolean
  refreshDeps?: unknown[]
}

export function useGatewayList<T, P = Record<string, unknown>>(options: UseGatewayListOptions<P>) {
  const { method, params, autoFetch = true, refreshDeps = [] } = options
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const client = getGatewayClient()
      const res = await client.request<Record<string, T[]>>(method as GatewayMethod, params)
      // Standardize response extraction (e.g., res.skills or res.tools)
      const key = method.split(':')[0]
      setData(res[key] || [])
    } catch (err) {
      console.error(`Failed to fetch ${method}:`, err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [method, params])

  useEffect(() => {
    if (autoFetch) {
      fetchData()
    }
  }, [fetchData, autoFetch, refreshDeps]) // Removed spread operator to satisfy eslint

  return { data, setData, loading, error, refresh: fetchData }
}
