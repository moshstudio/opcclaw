import React from 'react'
import { motion } from 'framer-motion'
import { Brain } from 'lucide-react'

export const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-xl">
      <div className="flex flex-col items-center">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 1, 0.5],
            rotate: [0, 5, -5, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="relative mb-8"
        >
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <div className="relative p-6 rounded-3xl bg-primary/10 border border-primary/20 text-primary">
            <Brain className="w-16 h-16" />
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <h2 className="text-xl font-bold text-foreground mb-2">正在加载智能体...</h2>
          <p className="text-sm text-muted-foreground animate-pulse">正在为您准备个人工作空间</p>
        </motion.div>
      </div>
    </div>
  )
}
