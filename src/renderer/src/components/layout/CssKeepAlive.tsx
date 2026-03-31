import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface CssKeepAliveProps {
  active: boolean
  children: React.ReactNode
}

/**
 * CSS Keep-Alive
 *
 * 通过 display:none/flex 控制显隐，组件始终在同一 React Fiber 树中，
 * 确保 Zustand / Context 订阅不断链（解决 react-activation portal 隔离问题）。
 *
 * - 懒加载：首次激活才渲染子组件
 * - 入场动画：每次从隐藏切换到显示时播放
 * - 状态保留：隐藏时不卸载
 */
const CssKeepAlive: React.FC<CssKeepAliveProps> = ({ active, children }) => {
  // React 官方 "adjusting state during render" 模式：用 useState 追踪上一次的 active 值
  const [prevActive, setPrevActive] = useState(active)
  const [hasActivated, setHasActivated] = useState(active)
  const [animKey, setAnimKey] = useState(0)

  if (active !== prevActive) {
    setPrevActive(active)
    if (active) {
      if (!hasActivated) setHasActivated(true)
      setAnimKey((k) => k + 1)
    }
  }

  if (!hasActivated) return null

  return (
    <div
      style={{
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        width: '100%',
        height: '100%'
      }}
    >
      <motion.div
        key={animKey}
        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ flex: 1, minHeight: 0 }}
      >
        {children}
      </motion.div>
    </div>
  )
}

export default CssKeepAlive
