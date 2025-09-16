import fs from 'fs'
import path from 'path'

// Recursively walk a directory and return absolute file paths
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) files.push(...walk(p))
    else if (e.isFile() && p.toLowerCase().endsWith('.json')) files.push(p)
  }
  return files
}

function extractParametersFromFile(filePath, absBase) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    const params = []
    // Derive hierarchy (domain/subsection/subsubsection) from folder/file path
    const rel = path.relative(absBase, filePath)
    const parts = rel.split(path.sep)
    const baseNoExt = path.basename(filePath, path.extname(filePath))
    let domain = parts[0] || baseNoExt
    let subsection = ''
    let subsubsection = ''
    if (parts.length === 1) {
      // file at root -> domain = file base
      subsection = ''
      subsubsection = ''
    } else if (parts.length === 2) {
      // domain/file or domain/subdir-file
      subsection = parts[1].replace(/\.json$/i, '')
    } else if (parts.length >= 3) {
      subsection = parts[1]
      subsubsection = parts[2].replace(/\.json$/i, '')
    }
    // Helper: expand "bus/[A-B-C-D-E-F-G-H]" into concrete bus letters when under SOURCES domain
    const expandBusShorthand = (pStr) => {
      const token = '/bus/[A-B-C-D-E-F-G-H]'
      if (domain === 'SOURCES' && typeof pStr === 'string' && pStr.includes(token)) {
        const buses = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        return buses.map((b) => pStr.replace(token, `/bus/${b}`))
      }
      return [pStr]
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        const p = item?.Parameter
        const section = item?.section || ''
        const settable = !!item?.Settable
        const args = item?.args || '--'
        const description = item?.description || ''
        const unit = item?.unit || ''
        if (typeof p === 'string' && p.startsWith('/')) {
          for (const px of expandBusShorthand(p)) {
            params.push({ path: px, section, settable, args, description, unit, domain, subsection, subsubsection })
          }
        }
      }
    }
    return params
  } catch {
    return []
  }
}

// Simple in-memory cache to avoid re-scanning on every call
let CACHE = null
let CACHE_TS = 0
const CACHE_TTL_MS = 15 * 1000 // 15 seconds; adjust as needed

export function getOscSpecPaths(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  try {
    const now = Date.now()
    if (CACHE && now - CACHE_TS < CACHE_TTL_MS) {
      // Return cached flattened paths
      return CACHE.paths
    }

    const absBase = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir)
    if (!fs.existsSync(absBase)) return []
    const files = walk(absBase)
    const set = new Set()
    const entries = []
    for (const f of files) {
      for (const rec of extractParametersFromFile(f, absBase)) {
        if (!set.has(rec.path)) {
          set.add(rec.path)
          entries.push(rec)
        }
      }
    }
    // Sort primarily by section, then by path
    entries.sort((a, b) => (a.section || '').localeCompare(b.section || '') || a.path.localeCompare(b.path))

    CACHE = { entries, paths: entries.map((e) => e.path) }
    CACHE_TS = now
    return CACHE.paths
  } catch {
    return []
  }
}

export function getOscSpecChoices(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  try {
    const paths = getOscSpecPaths(baseDir) // ensures CACHE is populated
    if (!CACHE?.entries) return paths.map((p) => ({ id: p, label: p }))

    // Build label as "Section • Path" (fallback to Path only if section empty)
    const choices = CACHE.entries.map((e) => ({
      id: e.path,
      label: e.section ? `${e.section} • ${e.path}` : e.path,
    }))
    return choices
  } catch {
    return []
  }
}

export function getOscSpecEntries(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  getOscSpecPaths(baseDir) // refresh CACHE if needed
  return CACHE?.entries ? [...CACHE.entries] : []
}

// Derive a human-friendly feature from a path, using the last 1-2 semantic tokens
function deriveFeatureFromPath(p) {
  const segs = String(p).split('/').filter(Boolean)
  // Filter out placeholder-like or bracket/range tokens
  const keep = segs.filter((s) => !/^\{.*\}$/.test(s) && !/^\[.*\]$/.test(s) && !/^\d+$/.test(s))
  if (keep.length === 0) return p
  const last = keep[keep.length - 1]
  const prev = keep[keep.length - 2]
  const joiners = new Set(['view3D','equalizer','encoder','levels','dynamics','reverb','routing','direction','speaker','bus','hoa','itd','spread'])
  if (prev && joiners.has(prev)) return `${prev}/${last}`
  return last
}

// Grouped choices: label as "Section • Feature — Path"
export function getGroupedSpecChoices(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  try {
    const entries = getOscSpecEntries(baseDir)
    const choices = entries.map((e) => {
      const feature = deriveFeatureFromPath(e.path)
      const prefixParts = [e.domain, e.subsection, e.subsubsection].filter(Boolean)
      const prefix = prefixParts.length ? prefixParts.join(' / ') : (e.section || 'OSC')
      return { id: e.path, label: `${prefix} • ${feature} — ${e.path}` }
    })
    return choices
  } catch {
    return []
  }
}

// Unique list of sections present in specs
function normSection(s) {
  return String(s || 'OSC').normalize('NFKC').trim()
}

export function getOscSections(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const set = new Set(entries.map((e) => normSection(e.section)))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

// Grouped choices filtered by section
export function getGroupedSpecChoicesBySection(section, baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  try {
    const entries = getOscSpecEntries(baseDir)
    const target = normSection(section)
    const filtered = entries.filter((e) => normSection(e.section) === target)
    return filtered.map((e) => {
      const feature = deriveFeatureFromPath(e.path)
      const sec = normSection(e.section)
      return { id: e.path, label: `${sec} • ${feature} — ${e.path}` }
    })
  } catch {
    return []
  }
}

// --- Hierarchical helpers (Domain -> Subsection -> Sub-subsection -> Paths) ---
export function getDomainList(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const set = new Set(entries.map((e) => e.domain || ''))
  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b))
}

export function getSubsectionsFor(domain, baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const set = new Set(entries.filter((e) => e.domain === domain).map((e) => e.subsection || ''))
  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b))
}

export function getSubSubsectionsFor(domain, subsection, baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const set = new Set(entries.filter((e) => e.domain === domain && e.subsection === subsection).map((e) => e.subsubsection || ''))
  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b))
}

export function getPathsFor(domain, subsection, subsubsection, baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const filtered = entries.filter((e) => e.domain === domain && e.subsection === subsection && e.subsubsection === subsubsection)
  return filtered.sort((a, b) => a.path.localeCompare(b.path)).map((e) => {
    const feature = deriveFeatureFromPath(e.path)
    return { id: e.path, label: `${feature} — ${e.path}` }
  })
}

export function getPathsForDomain(domain, baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const filtered = entries.filter((e) => e.domain === domain)
  return filtered.sort((a, b) => a.path.localeCompare(b.path)).map((e) => {
    const feature = deriveFeatureFromPath(e.path)
    const prefixParts = [e.subsection, e.subsubsection].filter(Boolean)
    const prefix = prefixParts.length ? `${prefixParts.join(' / ')} • ` : ''
    return { id: e.path, label: `${prefix}${feature} — ${e.path}` }
  })
}

// File-level scopes: one per JSON file (domain/subsection/subsubsection)
export function getFileScopes(baseDir = path.join(process.cwd(), 'utils', 'OSC_SPECS')) {
  const entries = getOscSpecEntries(baseDir)
  const byKey = new Map()
  for (const e of entries) {
    const key = `${e.domain}||${e.subsection}||${e.subsubsection}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(e)
  }
  const scopes = []
  for (const [key, arr] of byKey.entries()) {
    const [domain, subsection, subsubsection] = key.split('||')
    if (!domain) continue
    const labelParts = [domain, subsection, subsubsection].filter(Boolean)
    const label = labelParts.join(' / ')
    // Build path choices with feature and path, and append args info for clarity
    const choices = arr
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((e) => {
        const feature = deriveFeatureFromPath(e.path)
        const argsInfo = String(e.args || '--').trim()
        return { id: e.path, label: `${feature} — ${e.path}  • args: ${argsInfo}` }
      })
    scopes.push({ domain, subsection, subsubsection, label, entries: arr, choices })
  }
  // Sort scopes by label for a consistent UI ordering
  scopes.sort((a, b) => a.label.localeCompare(b.label))
  return scopes
}

export default getOscSpecPaths
