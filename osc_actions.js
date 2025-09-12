// Dynamically register OSC actions from generated templates
// Reads docs/osc_companion_actions_template.json and appends actions at init

import fs from 'fs'
import path from 'path'
import { Regex } from '@companion-module/base'

function resolveAddress(template, options) {
  return String(template || '').replace(/\{([^}]+)\}/g, (_, name) => String(options?.[name] ?? ''))
}

function toChoices(arr = []) {
  return (arr || []).map((v) => ({ id: String(v), label: String(v) }))
}

function buildOptionFromPlaceholder(p) {
  // Treat placeholders as integer number inputs by default
  return {
    type: 'textinput',
    id: p.name,
    label: p.name,
    default: '',
    regex: Regex.SIGNED_NUMBER,
    useVariables: true,
  }
}

function buildValueOption(arg = {}) {
  if (!arg || !arg.type) {
    return { type: 'textinput', id: 'value', label: 'value', default: '', useVariables: true }
  }
  if (arg.enum && Array.isArray(arg.enum) && arg.enum.length > 0) {
    return { type: 'dropdown', id: 'value', label: 'value', default: String(arg.enum[0]), choices: toChoices(arg.enum) }
  }
  const t = arg.type.toLowerCase()
  if (t.startsWith('number') || t === 'int') {
    return { type: 'textinput', id: 'value', label: 'value', default: arg.min ?? 0, regex: Regex.SIGNED_FLOAT, useVariables: true }
  }
  if (t === 'boolean') {
    return { type: 'dropdown', id: 'value', label: 'value', default: '1', choices: toChoices(['1', '0']) }
  }
  return { type: 'textinput', id: 'value', label: 'value', default: '', useVariables: true }
}

function coerceArgForOsc(argSpec = {}, raw) {
  // Returns { type: 'i'|'f'|'s', value: any }
  if (argSpec && argSpec.enum) {
    return { type: 's', value: String(raw) }
  }
  const s = String(raw)
  const t = (argSpec?.type || '').toLowerCase()
  if (t === 'boolean') {
    const v = s === 'true' || s === '1' ? 1 : 0
    return { type: 'i', value: v }
  }
  if (t === 'int') {
    const v = Number(s)
    return { type: 'i', value: Number.isNaN(v) ? 0 : Math.trunc(v) }
  }
  if (t.startsWith('number')) {
    const v = Number(s)
    return { type: 'f', value: Number.isNaN(v) ? 0 : v }
  }
  return { type: 's', value: s }
}

export function setupOSCActions(instance) {
  let templateData = []
  try {
    const p = path.resolve(process.cwd(), 'docs', 'osc_companion_actions_template.json')
    const raw = fs.readFileSync(p, 'utf8')
    templateData = JSON.parse(raw)
  } catch (e) {
    instance?.log?.('debug', `OSC actions template not found or unreadable: ${e?.message}`)
  }

  // Wrap/extend existing initActions
  const originalInit = instance.initActions?.bind(instance)

  instance.initActions = function initActions() {
    originalInit && originalInit()

    const extra = {}

    for (const a of templateData) {
      const isGet = a.id?.startsWith('get.')
      const actionId = a.id || (isGet ? `get.${a.oscTemplate}` : `set.${a.oscTemplate}`)

      const placeholderOptions = (a.inputs || [])
        .filter((inp) => inp.id && inp.id !== 'value')
        .map((inp) => ({
          type: inp.type === 'text' ? 'textinput' : inp.type,
          id: inp.id,
          label: inp.label || inp.id,
          default: inp.default ?? '',
          useVariables: true,
          regex: inp.type === 'text' ? undefined : Regex.SIGNED_NUMBER,
          choices: inp.choices ? toChoices(inp.choices.map((c) => (c.id ? c.id : c))) : undefined,
        }))

      // Determine value option from args (first arg only)
      let valueOption = null
      if (!isGet) {
        const firstArg = (a.args && a.args[0]) || null
        const built = buildValueOption(firstArg)
        // Normalize dropdown choices if needed
        if (built.type === 'dropdown' && built.choices && built.choices.length && !built.choices[0].id) {
          built.choices = toChoices(built.choices)
        }
        valueOption = built
      }

      const options = [...placeholderOptions, ...(valueOption ? [valueOption] : [])]

      extra[actionId] = {
        name: a.label || actionId,
        options,
        callback: async (action, context) => {
          try {
            // Resolve placeholder values from options
            const opts = action.options || {}
            const address = resolveAddress(a.oscTemplate, opts)

            if (isGet) {
              instance.oscSend(address, [])
              return
            }

            // Build args according to first arg spec
            const firstArg = (a.args && a.args[0]) || null
            let rawValue = opts.value
            if (typeof rawValue === 'string' && context?.parseVariablesInString) {
              rawValue = await context.parseVariablesInString(rawValue)
            }
            const arg = coerceArgForOsc(firstArg, rawValue)
            instance.oscSend(address, [arg])
          } catch (e) {
            instance.log('error', `OSC action failed: ${e?.message}`)
          }
        },
      }
    }

    if (Object.keys(extra).length > 0) {
      instance.setActionDefinitions?.(extra)
    }
  }
}
