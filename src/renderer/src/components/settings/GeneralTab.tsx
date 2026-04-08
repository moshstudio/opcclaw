import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import AppearanceSettings from './general/AppearanceSettings'
import AgentDefaultsSettings from './general/AgentDefaultsSettings'
import InteractionSettings from './general/InteractionSettings'
import NetworkSettings from './general/NetworkSettings'
import StartupSettings from './general/StartupSettings'
import DangerZone from './general/DangerZone'

const GeneralTab: React.FC = () => {
  const { t } = useTranslation()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-xl font-bold">{t('settings.app_settings')}</h2>
        <p className="text-xs text-muted-foreground font-medium">{t('settings.app_settings')}</p>
      </div>

      <div className="space-y-6">
        <AppearanceSettings />
        <StartupSettings />
        <AgentDefaultsSettings />
        <InteractionSettings />
        <NetworkSettings />
      </div>

      <DangerZone />
    </motion.div>
  )
}

export default GeneralTab
