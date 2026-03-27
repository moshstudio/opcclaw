import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { TFunction } from 'i18next'

dayjs.extend(duration)

/**
 * Formats a duration in milliseconds into a human-readable string (minutes, hours, days).
 * @param ms Duration in milliseconds
 * @param t i18next TFunction
 * @returns Formatted duration string
 */
export const formatDuration = (ms: number, t: TFunction): string => {
  if (!ms || ms <= 0) return '0' + t('common.minute_short')

  const dur = dayjs.duration(ms)
  const days = Math.floor(dur.asDays())
  const hours = dur.hours()
  const minutes = dur.minutes()

  const parts: string[] = []

  if (days > 0) {
    parts.push(`${days}${t('common.day_short')}`)
  }
  if (hours > 0) {
    parts.push(`${hours}${t('common.hour_short')}`)
  }
  if (minutes > 0 || (days === 0 && hours === 0)) {
    parts.push(`${minutes}${t('common.minute_short')}`)
  }

  return parts.join(' ')
}
