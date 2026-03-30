import React from 'react'
import { motion } from 'framer-motion'
import icon from '../../assets/icon.png'

export const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-3xl overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="flex flex-col items-center relative z-10">
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            y: [0, -5, 0],
            rotate: [0, 2, -2, 0]
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="relative mb-12"
        >
          {/* Paw Glow */}
          <div className="absolute inset-0 bg-primary/25 blur-[60px] rounded-full scale-110" />

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary/20 to-accent/20 rounded-[40px] blur opacity-40 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative p-8 rounded-[40px] bg-card/40 border border-white/10 shadow-2xl backdrop-blur-sm">
              <img
                src={icon}
                alt="Logo"
                className="w-24 h-24 object-contain select-none pointer-events-none"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <h2 className="text-2xl font-black tracking-tight text-foreground/90 font-sans">
              OPCCLAW
            </h2>
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          </div>
          <p className="text-sm font-medium text-muted-foreground/70 tracking-widest uppercase">
            Preparing your workspace
          </p>
        </motion.div>
      </div>
    </div>
  )
}
