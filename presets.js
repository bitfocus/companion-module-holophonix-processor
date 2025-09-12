import { getOscSpecEntries } from './utils/osc_paths_specs.js'
import { inferPlaceholderType } from './utils/osc_utils.js'

function hasPlaceholders(path) {
  return /\{[^}]+\}/.test(path)
}

function wildcardPath(path) {
  return String(path).replace(/\{[^}]+\}/g, '*')
}

function sanitizeVarName(s) {
  return String(s).replace(/[^-a-zA-Z0-9_]/g, '_').slice(0, 64)
}

export function setupPresets(instance) {
  instance.initPresets = function initPresets() {
    const entries = getOscSpecEntries()
    const presets = []

    for (const e of entries) {
      const section = e.section || 'OSC'
      const path = e.path
      const titleBase = `${section} • ${path}`

      // Safe GET preset: use wildcard pattern where placeholders exist
      const getPath = hasPlaceholders(path) ? wildcardPath(path) : path
      presets.push({
        category: section,
        name: `${titleBase} — Get`,
        type: 'button',
        style: { text: `${titleBase}\nGet`, size: 'auto', bgcolor: 0x222222, color: 0xffffff },
        steps: [
          {
            down: [
              {
                actionId: 'osc_get_value',
                options: { path_source: 'custom', osc_path: getPath },
              },
            ],
            up: [],
          },
        ],
        feedbacks: [],
      })

      // Safe SET preset: only when there are no placeholders and args are scalar (number|string)
      if (e.settable && !hasPlaceholders(path)) {
        if (e.args === 'number') {
          presets.push({
            category: section,
            name: `${titleBase} — Set (number)`,
            type: 'button',
            style: { text: `${titleBase}\nSet`, size: 'auto', bgcolor: 0x003366, color: 0xffffff },
            steps: [
              {
                down: [
                  {
                    actionId: 'osc_send_float',
                    options: { path, float: 0 },
                  },
                ],
                up: [],
              },
            ],
            feedbacks: [],
          })
        } else if (e.args === 'string') {
          presets.push({
            category: section,
            name: `${titleBase} — Set (string)`,
            type: 'button',
            style: { text: `${titleBase}\nSet`, size: 'auto', bgcolor: 0x330033, color: 0xffffff },
            steps: [
              {
                down: [
                  {
                    actionId: 'osc_send_string',
                    options: { path, string: '' },
                  },
                ],
                up: [],
              },
            ],
            feedbacks: [],
          })
        } else if (e.args === 'array') {
          // Array set can be risky; still provide but require explicit JSON array edit
          presets.push({
            category: section,
            name: `${titleBase} — Set (array JSON)`,
            type: 'button',
            style: { text: `${titleBase}\nSet [JSON]`, size: 'auto', bgcolor: 0x003333, color: 0xffffff },
            steps: [
              {
                down: [
                  {
                    actionId: 'osc_send_array',
                    options: { path, args: '[]' },
                  },
                ],
                up: [],
              },
            ],
            feedbacks: [],
          })
        }
      }
    }

    this.setPresetDefinitions?.(presets)
  }
}
