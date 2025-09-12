// Utility helpers for OSC path placeholder handling and type inference

// Infer placeholder type from its name
// number-like: *Index, *Id, index, id, channel, bus, track, band, filter, speaker
// string-like: source_type, type, mode, name (default to string if uncertain)
export function inferPlaceholderType(name = '') {
  const n = String(name).toLowerCase()
  const numericHints = ['index', 'id', 'channel', 'bus', 'track', 'band', 'filter', 'speaker']
  if (numericHints.some((h) => n.endsWith(h))) return 'number'
  if (n === 'source_type' || n.endsWith('type') || n.endsWith('mode') || n.endsWith('name')) return 'string'
  // Default to number if it looks numeric-ish
  if (/\d$/.test(n)) return 'number'
  return 'number'
}

// Replace placeholders in a template path using a provided map
// template: "/speaker/{speakerIndex}/routing/output/{index}/master"
// map: { speakerIndex: 1, index: 2 }
export function resolvePathPlaceholders(template, map = {}) {
  if (!template || typeof template !== 'string') return template || ''
  return template.replace(/\{([^}]+)\}/g, (m, key) => {
    const k = String(key)
    if (Object.prototype.hasOwnProperty.call(map, k)) return String(map[k])
    return m // leave unresolved
  })
}

// Parse JSON safely with fallback
export function parseJsonSafe(input, fallback) {
  try { return JSON.parse(input) } catch { return fallback }
}
