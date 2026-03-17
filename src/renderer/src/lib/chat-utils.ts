export const isJson = (val: any): boolean => {
  if (typeof val === 'object' && val !== null) return true
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (
    !((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')))
  ) {
    return false
  }
  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null
  } catch (e) {
    return false
  }
}

export const formatJson = (val: any): string => {
  if (typeof val === 'string' && isJson(val)) {
    try {
      return JSON.stringify(JSON.parse(val), null, 2)
    } catch (e) {
      return val
    }
  }
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val, null, 2)
  }
  return val
}
