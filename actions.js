import WebSocket from 'ws'
import objectPath from 'object-path'
import { Regex } from '@companion-module/base'
import { getOscSpecEntries, getOscSpecChoices, getFileScopes } from './utils/osc_paths_specs.js'
import { inferPlaceholderType, resolvePathPlaceholders, parseJsonSafe } from './utils/osc_utils.js'

export function setupActions(instance) {
  instance.initActions = function initActions() {
    // Conditionally build action definitions
    const defs = {}

    // Build a quick lookup for specs by path and helpers for grouped actions
    const entriesAll = getOscSpecEntries()
    const entryByPath = {}
    for (const e of entriesAll) entryByPath[e.path] = e
    const normalizeArgKind = (raw) => {
      const s = String(raw || '--').trim().toLowerCase()
      if (s === 'boolean' || s === 'bool') return 'boolean'
      if (s === 'integer' || s === 'int' || s === 'number' || s === 'float') return 'number'
      if (s === 'string') return 'string'
      if (s === 'array') return 'array'
      if (s === 'none' || s === '--') return 'none'
      if (s.startsWith('[')) return 'array'
      return 'array'
    }
    const argKindForPath = (p) => normalizeArgKind(entryByPath[p]?.args)
    // Precompute arg-kind membership sets for robust isVisible checks (no function calls inside isVisible)
    const kindNumber = new Set()
    const kindString = new Set()
    const kindBoolean = new Set()
    const kindArray = new Set()
    const MAX_ARGS = 8
    const bracketStructured = new Set()
    const argInt = Array.from({ length: MAX_ARGS }, () => new Set())
    const argNum = Array.from({ length: MAX_ARGS }, () => new Set())
    const argStr = Array.from({ length: MAX_ARGS }, () => new Set())
    const argBool = Array.from({ length: MAX_ARGS }, () => new Set())
    const argNameType = Array.from({ length: MAX_ARGS }, () => new Set())
    const argNameFormat = Array.from({ length: MAX_ARGS }, () => new Set())
    for (const e of entriesAll) {
      const k = normalizeArgKind(e.args)
      if (k === 'number') kindNumber.add(e.path)
      else if (k === 'string') kindString.add(e.path)
      else if (k === 'boolean') kindBoolean.add(e.path)
      else if (k === 'array') kindArray.add(e.path)

      // Parse structured bracket args for per-argument fields
      const raw = String(e.args || '').trim()
      if (raw.startsWith('[')) {
        try {
          const inside = raw.slice(1, -1)
          const types = inside.split(',').map((s) => s.trim().toLowerCase())
          let names = []
          const mdesc = String(e.description || '').match(/\[([^\]]+)\]/)
          if (mdesc) names = mdesc[1].split(',').map((s) => s.trim())
          bracketStructured.add(e.path)
          for (let i = 0; i < Math.min(types.length, MAX_ARGS); i++) {
            const t = types[i]
            const n = (names[i] || '').toLowerCase()
            if (n === 'type') argNameType[i].add(e.path)
            else if (n === 'format') argNameFormat[i].add(e.path)
            if (t === 'integer' || t === 'int') argInt[i].add(e.path)
            else if (t === 'float' || t === 'number') argNum[i].add(e.path)
            else if (t === 'boolean' || t === 'bool') argBool[i].add(e.path)
            else argStr[i].add(e.path)
          }
        } catch {}
      }
    }

    // ---------------- Scoped Generic Actions (file-level) ----------------
    const fileScopes = getFileScopes()

    // Use a fixed option id inside each scoped action to avoid closures in isVisible
    const PATH_OPT_ID = 'grouped_path'

    // GET (scoped)
    fileScopes.forEach((scope, scopeIndex) => {
      const pathId = PATH_OPT_ID
      // Fixed explicit placeholder list for robust UI
      const explicitPhKeys = [
        'speakerIndex',
        'trackIndex',
        'index',
        'filterIndex',
        'busIndex',
        'channelIndex',
        'bandIndex',
        'sourceId',
        'id',
        'source_type',
      ]
      defs[`osc_get_scope_${scopeIndex}`] = {
        name: `OSC: Get (${scope.label})`,
        options: [
          { type: 'dropdown', id: 'grouped_path', label: 'Path', width: 12, choices: [{ id: '', label: '— Select —' }, ...scope.choices] },
          // Placeholder inputs (explicit list with pure-opts visibility)
          { type: 'textinput', label: 'speakerIndex (number)', id: `ph_speakerIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{speakerIndex}') },
          { type: 'textinput', label: 'trackIndex (number)', id: `ph_trackIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{trackIndex}') },
          { type: 'textinput', label: 'index (number)', id: `ph_index_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{index}') },
          { type: 'textinput', label: 'filterIndex (number)', id: `ph_filterIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{filterIndex}') },
          { type: 'textinput', label: 'busIndex (number)', id: `ph_busIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{busIndex}') },
          { type: 'textinput', label: 'channelIndex (number)', id: `ph_channelIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{channelIndex}') },
          { type: 'textinput', label: 'bandIndex (number)', id: `ph_bandIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{bandIndex}') },
          { type: 'textinput', label: 'sourceId (number)', id: `ph_sourceId_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{sourceId}') },
          { type: 'textinput', label: 'id (number)', id: `ph_id_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{id}') },
          { type: 'textinput', label: 'source_type (string)', id: `ph_source_type_${scopeIndex}`, default: '', width: 6, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{source_type}') },
        ],
        callback: async (action, context) => {
          const basePath = `${action.options.grouped_path || ''}`
          if (!basePath) return
          const phMap = {}
          for (const key of explicitPhKeys) {
            const raw = await context.parseVariablesInString(action.options[`ph_${key}_${scopeIndex}`] ?? '')
            if (String(raw).trim() !== '') phMap[key] = raw
          }
          const chosen = resolvePathPlaceholders(basePath, phMap)
          const m = chosen.match(/^\/\{([^}]+)\}(.*)$/)
          if (m) {
            const items = m[1].split(',').map((s) => s.trim()).filter(Boolean)
            const rest = m[2] || ''
            for (const it of items) this.oscSend('/get', [{ type: 's', value: `/${it}${rest}` }])
          } else {
            this.oscSend('/get', [{ type: 's', value: chosen }])
          }
        }
      }
    })

    // SET (scoped)
    fileScopes.forEach((scope, scopeIndex) => {
      const pathId = PATH_OPT_ID
      const explicitPhKeys = [
        'speakerIndex',
        'trackIndex',
        'index',
        'filterIndex',
        'busIndex',
        'channelIndex',
        'bandIndex',
        'sourceId',
        'id',
        'source_type',
      ]
      // Build per-path arg kind lookups
      const kinds = { number: new Set(), string: new Set(), boolean: new Set(), array: new Set() }
      const MAX_ARGS = 8
      const bracket = new Set()
      const argInt = Array.from({ length: MAX_ARGS }, () => new Set())
      const argNum = Array.from({ length: MAX_ARGS }, () => new Set())
      const argStr = Array.from({ length: MAX_ARGS }, () => new Set())
      const argBool = Array.from({ length: MAX_ARGS }, () => new Set())
      const argNameType = Array.from({ length: MAX_ARGS }, () => new Set())
      const argNameFormat = Array.from({ length: MAX_ARGS }, () => new Set())
      for (const e of scope.entries) {
        const s = String(e.args || '--').trim().toLowerCase()
        let k = 'array'
        if (s === 'boolean' || s === 'bool') k = 'boolean'
        else if (s === 'integer' || s === 'int' || s === 'number' || s === 'float') k = 'number'
        else if (s === 'string') k = 'string'
        else if (s === 'array') k = 'array'
        else if (s === 'none' || s === '--') k = 'none'
        else if (s.startsWith('[')) k = 'array'
        kinds[k]?.add(e.path)
        const raw = String(e.args || '').trim()
        if (raw.startsWith('[')) {
          try {
            const inside = raw.slice(1, -1)
            const types = inside.split(',').map((s) => s.trim().toLowerCase())
            let names = []
            const mdesc = String(e.description || '').match(/\[([^\]]+)\]/)
            if (mdesc) names = mdesc[1].split(',').map((s) => s.trim())
            bracket.add(e.path)
            for (let i = 0; i < Math.min(types.length, MAX_ARGS); i++) {
              const t = types[i]
              const n = (names[i] || '').toLowerCase()
              if (n === 'type') argNameType[i].add(e.path)
              else if (n === 'format') argNameFormat[i].add(e.path)
              if (t === 'integer' || t === 'int') argInt[i].add(e.path)
              else if (t === 'float' || t === 'number') argNum[i].add(e.path)
              else if (t === 'boolean' || t === 'bool') argBool[i].add(e.path)
              else argStr[i].add(e.path)
            }
          } catch {}
        }
      }

      defs[`osc_set_scope_${scopeIndex}`] = {
        name: `OSC: Set (${scope.label})`,
        options: [
          { type: 'dropdown', id: 'grouped_path', label: 'Path', width: 12, choices: [{ id: '', label: '— Select —' }, ...scope.choices] },
          // Explicit placeholder inputs
          { type: 'textinput', label: 'speakerIndex (number)', id: `ph_speakerIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{speakerIndex}') },
          { type: 'textinput', label: 'trackIndex (number)', id: `ph_trackIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{trackIndex}') },
          { type: 'textinput', label: 'index (number)', id: `ph_index_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{index}') },
          { type: 'textinput', label: 'filterIndex (number)', id: `ph_filterIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{filterIndex}') },
          { type: 'textinput', label: 'busIndex (number)', id: `ph_busIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{busIndex}') },
          { type: 'textinput', label: 'channelIndex (number)', id: `ph_channelIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{channelIndex}') },
          { type: 'textinput', label: 'bandIndex (number)', id: `ph_bandIndex_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{bandIndex}') },
          { type: 'textinput', label: 'sourceId (number)', id: `ph_sourceId_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{sourceId}') },
          { type: 'textinput', label: 'id (number)', id: `ph_id_${scopeIndex}`, default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{id}') },
          { type: 'textinput', label: 'source_type (string)', id: `ph_source_type_${scopeIndex}`, default: '', width: 6, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{source_type}') },
          // Structured args (bracket lists)
          { type: 'dropdown', id: `arg_0_type_${scopeIndex}`, label: 'type', width: 6, default: 'Mono', choices: [
            { id: 'Mono', label: 'Mono' }, { id: 'Stereo', label: 'Stereo' }, { id: 'Multichannel', label: 'Multichannel' },
            { id: 'EigenMike32', label: 'EigenMike32' }, { id: 'EigenMike64', label: 'EigenMike64' }, { id: 'MicTree', label: 'MicTree' },
            { id: 'Bformat', label: 'Bformat' }, { id: 'Aformat', label: 'Aformat' }, { id: 'Direct To Master', label: 'Direct To Master' },
            { id: 'Direct To Bus', label: 'Direct To Bus' }, { id: 'HOA Stream', label: 'HOA Stream' }, { id: 'HOA DRIR', label: 'HOA DRIR' }, { id: 'Zylia', label: 'Zylia' }
          ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNameType[0].has(p) } },
          { type: 'dropdown', id: `arg_0_format_${scopeIndex}`, label: 'format', width: 6, default: 'WFS', choices: [
            { id: 'WFS', label: 'WFS' }, { id: 'HOA', label: 'HOA' }, { id: 'HOA2D', label: 'HOA2D' }, { id: 'VBAP', label: 'VBAP' }, { id: 'VBAP2D', label: 'VBAP2D' },
            { id: 'VBIP', label: 'VBIP' }, { id: 'VBIP2D', label: 'VBIP2D' }, { id: 'Binaural', label: 'Binaural' }, { id: 'Transaural', label: 'Transaural' },
            { id: 'Stereo AB', label: 'Stereo AB' }, { id: 'Stereo XY', label: 'Stereo XY' }, { id: 'Stereo Pan', label: 'Stereo Pan' }, { id: 'Angular 2D', label: 'Angular 2D' },
            { id: 'KNN', label: 'KNN' }, { id: 'LBAP', label: 'LBAP' }, { id: 'Thru', label: 'Thru' }
          ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNameFormat[0].has(p) } },
          // Arg slots (0..5)
          { type: 'dropdown', id: `arg_0_bool_${scopeIndex}`, label: 'Arg 1 (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argBool[0].has(p) } },
          { type: 'textinput', id: `arg_0_int_${scopeIndex}`, label: 'Arg 1 (integer)', default: '0', regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argInt[0].has(p) && !argNameType[0].has(p) && !argNameFormat[0].has(p) } },
          { type: 'textinput', id: `arg_0_num_${scopeIndex}`, label: 'Arg 1 (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNum[0].has(p) && !argNameType[0].has(p) && !argNameFormat[0].has(p) } },
          { type: 'textinput', id: `arg_0_str_${scopeIndex}`, label: 'Arg 1 (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argStr[0].has(p) && !argNameType[0].has(p) && !argNameFormat[0].has(p) } },
          // Arg 2
          { type: 'dropdown', id: `arg_1_bool_${scopeIndex}`, label: 'Arg 2 (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argBool[1].has(p) } },
          { type: 'textinput', id: `arg_1_int_${scopeIndex}`, label: 'Arg 2 (integer)', default: '0', regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argInt[1].has(p) } },
          { type: 'textinput', id: `arg_1_num_${scopeIndex}`, label: 'Arg 2 (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNum[1].has(p) } },
          { type: 'textinput', id: `arg_1_str_${scopeIndex}`, label: 'Arg 2 (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argStr[1].has(p) } },
          // Arg 3
          { type: 'dropdown', id: `arg_2_bool_${scopeIndex}`, label: 'Arg 3 (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argBool[2].has(p) } },
          { type: 'textinput', id: `arg_2_int_${scopeIndex}`, label: 'Arg 3 (integer)', default: '0', regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argInt[2].has(p) } },
          { type: 'textinput', id: `arg_2_num_${scopeIndex}`, label: 'Arg 3 (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNum[2].has(p) } },
          { type: 'textinput', id: `arg_2_str_${scopeIndex}`, label: 'Arg 3 (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argStr[2].has(p) } },
          // Arg 4
          { type: 'dropdown', id: `arg_3_bool_${scopeIndex}`, label: 'Arg 4 (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argBool[3].has(p) } },
          { type: 'textinput', id: `arg_3_int_${scopeIndex}`, label: 'Arg 4 (integer)', default: '0', regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argInt[3].has(p) } },
          { type: 'textinput', id: `arg_3_num_${scopeIndex}`, label: 'Arg 4 (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNum[3].has(p) } },
          { type: 'textinput', id: `arg_3_str_${scopeIndex}`, label: 'Arg 4 (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argStr[3].has(p) } },
          // Arg 5
          { type: 'dropdown', id: `arg_4_bool_${scopeIndex}`, label: 'Arg 5 (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argBool[4].has(p) } },
          { type: 'textinput', id: `arg_4_int_${scopeIndex}`, label: 'Arg 5 (integer)', default: '0', regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argInt[4].has(p) } },
          { type: 'textinput', id: `arg_4_num_${scopeIndex}`, label: 'Arg 5 (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNum[4].has(p) } },
          { type: 'textinput', id: `arg_4_str_${scopeIndex}`, label: 'Arg 5 (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argStr[4].has(p) } },
          // Arg 6
          { type: 'dropdown', id: `arg_5_bool_${scopeIndex}`, label: 'Arg 6 (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argBool[5].has(p) } },
          { type: 'textinput', id: `arg_5_int_${scopeIndex}`, label: 'Arg 6 (integer)', default: '0', regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argInt[5].has(p) } },
          { type: 'textinput', id: `arg_5_num_${scopeIndex}`, label: 'Arg 6 (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argNum[5].has(p) } },
          { type: 'textinput', id: `arg_5_str_${scopeIndex}`, label: 'Arg 6 (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && argStr[5].has(p) } },
          // Single-arg fallbacks
          { type: 'textinput', id: `val_number_${scopeIndex}`, label: 'Value (number)', default: '0', regex: Regex.SIGNED_FLOAT, useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && kinds.number.has(p) } },
          { type: 'textinput', id: `val_string_${scopeIndex}`, label: 'Value (string)', default: '', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && kinds.string.has(p) } },
          { type: 'dropdown', id: `val_boolean_${scopeIndex}`, label: 'Value (boolean)', width: 4, default: 1, choices: [ { id: 1, label: 'Yes (1)' }, { id: 0, label: 'No (0)' } ], isVisible: (opts) => { const p = opts.grouped_path || ''; return p && kinds.boolean.has(p) } },
          { type: 'textinput', id: `val_array_${scopeIndex}`, label: 'Args (JSON array)', default: '[]', useVariables: true, isVisible: (opts) => { const p = opts.grouped_path || ''; return p && kinds.array.has(p) && !bracket.has(p) } },
        ],
        callback: async (action, context) => {
          const basePath = `${action.options.grouped_path || ''}`
          if (!basePath) return
          const phMap = {}
          for (const key of explicitPhKeys) {
            const raw = await context.parseVariablesInString(action.options[`ph_${key}_${scopeIndex}`] ?? '')
            if (String(raw).trim() !== '') phMap[key] = raw
          }
          const resolved = resolvePathPlaceholders(basePath, phMap)
          // Send args
          if (kinds.number.has(basePath)) {
            const vRaw = await context.parseVariablesInString(action.options[`val_number_${scopeIndex}`] ?? '0')
            this.oscSend(resolved, [{ type: 'f', value: Number(vRaw) }])
          } else if (kinds.string.has(basePath)) {
            const vRaw = await context.parseVariablesInString(action.options[`val_string_${scopeIndex}`] ?? '')
            this.oscSend(resolved, [{ type: 's', value: '' + vRaw }])
          } else if (kinds.boolean.has(basePath)) {
            const v = Number(action.options[`val_boolean_${scopeIndex}`] ?? 1)
            this.oscSend(resolved, [{ type: 'i', value: v }])
          } else if (kinds.array.has(basePath)) {
            const oscArgs = []
            if (bracket.has(basePath)) {
              for (let i = 0; i < MAX_ARGS; i++) {
                if (argNameType[i].has(basePath)) {
                  const raw = action.options[`arg_0_type_${scopeIndex}`] ?? 'Mono'
                  oscArgs.push({ type: 's', value: '' + raw })
                } else if (argNameFormat[i].has(basePath)) {
                  const raw = action.options[`arg_0_format_${scopeIndex}`] ?? 'WFS'
                  oscArgs.push({ type: 's', value: '' + raw })
                } else if (argBool[i].has(basePath)) {
                  const raw = Number(action.options[`arg_${i}_bool_${scopeIndex}`] ?? 1)
                  oscArgs.push({ type: 'i', value: raw })
                } else if (argInt[i].has(basePath)) {
                  const raw = await context.parseVariablesInString(action.options[`arg_${i}_int_${scopeIndex}`] ?? '0')
                  oscArgs.push({ type: 'i', value: parseInt(raw) })
                } else if (argNum[i].has(basePath)) {
                  const raw = await context.parseVariablesInString(action.options[`arg_${i}_num_${scopeIndex}`] ?? '0')
                  oscArgs.push({ type: 'f', value: parseFloat(raw) })
                } else if (argStr[i].has(basePath)) {
                  const raw = await context.parseVariablesInString(action.options[`arg_${i}_str_${scopeIndex}`] ?? '')
                  oscArgs.push({ type: 's', value: '' + raw })
                }
              }
            } else {
              const arrStr = await context.parseVariablesInString(action.options[`val_array_${scopeIndex}`] ?? '[]')
              const arr = parseJsonSafe(arrStr, [])
              if (Array.isArray(arr)) {
                for (const v of arr) {
                  if (typeof v === 'number') oscArgs.push(Number.isInteger(v) ? { type: 'i', value: v } : { type: 'f', value: v })
                  else if (typeof v === 'boolean') oscArgs.push({ type: 'i', value: v ? 1 : 0 })
                  else if (v && typeof v === 'object' && typeof v.type === 'string' && 'value' in v) oscArgs.push({ type: v.type, value: v.value })
                  else oscArgs.push({ type: 's', value: String(v) })
                }
              }
            }
            this.oscSend(resolved, oscArgs)
          } else {
            this.oscSend(resolved, [])
          }
        }
      }
  })
    
// WS helpers and actions only if enabled
    if (this.config?.enable_websocket) {
      const genUuid = () => Math.random().toString(36).slice(2, 10)
      const sendWsRequest = async (method, payload = [], uuid = '') => {
        const id = uuid || genUuid()
        const envelope = [ { method, payload: Array.isArray(payload) ? payload : [], uuid: id } ]
        let termination = ''
        switch (this.config.append_new_line) {
          case true:
          case 'rn': termination = '\r\n'; break
          case 'nr': termination = '\n\r'; break
          case 'n': termination = '\n'; break
          case 'r': termination = '\r'; break
          default: termination = ''
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.log('warn', 'WS not connected')
          return
        }
        const serialized = JSON.stringify(envelope)
        if (this.config.debug_messages) this.log('debug', `WS Request -> ${serialized}`)
        await new Promise((resolve, reject) => {
          this.ws.send(`${serialized}${termination}`, (err) => err ? reject(err) : resolve())
        })
        this.setVariableValues({
          ws_latest_request_uuid: id,
          ws_latest_request_method: method,
          ws_latest_request_payload: JSON.stringify(payload),
        })
      }

      defs.ws_send = {
        name: 'WS: Send text',
        options: [ { type: 'textinput', label: 'Data', id: 'data', default: '', useVariables: true } ],
        callback: async (action, context) => {
          const value = await context.parseVariablesInString(action.options.data)
          let termination = ''
          switch (this.config.append_new_line) {
            case true:
            case 'rn': termination = '\r\n'; break
            case 'nr': termination = '\n\r'; break
            case 'n': termination = '\n'; break
            case 'r': termination = '\r'; break
            default: termination = ''
          }
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log('warn', 'WS not connected')
            return
          }
          if (this.config.debug_messages) this.log('debug', `WS Sending: ${value}`)
          await new Promise((resolve, reject) => {
            this.ws.send(`${value}${termination}`, (err) => err ? reject(err) : resolve())
          })
        },
      }

      defs.ws_extract_response = {
        name: 'WS: Extract response by UUID to variable',
        options: [
          { type: 'textinput', id: 'uuid', label: 'UUID', default: '', useVariables: true },
          { type: 'textinput', id: 'subpath', label: 'JSON Path (optional)', default: '', useVariables: true },
          { type: 'textinput', id: 'variable', label: 'Variable Name', default: 'ws_value', regex: '/^[-a-zA-Z0-9_]+$/' },
        ],
        callback: async (action, context) => {
          const uuid = await context.parseVariablesInString(action.options.uuid)
          const subpath = await context.parseVariablesInString(action.options.subpath)
          const variable = `${action.options.variable}`
          if (!uuid) {
            this.log('warn', 'WS extract: UUID is required')
            return
          }
          const stored = this.wsResponses?.get(uuid)
          if (!stored) {
            this.log('warn', `WS extract: No stored response for UUID ${uuid}`)
            return
          }
          let value = stored
          if (subpath && typeof stored === 'object') {
            if (objectPath.has(stored, subpath)) {
              value = objectPath.get(stored, subpath)
            } else {
              this.log('warn', `WS extract: subpath not found: ${subpath}`)
            }
          }
          this.setVariableValues({ [variable]: typeof value === 'object' ? JSON.stringify(value) : value })
        },
      }

      defs.ws_get_current_preset = {
        name: 'WS: getCurrentPreset',
        options: [],
        callback: async () => { await sendWsRequest('getCurrentPreset', [], '') },
      }
      defs.ws_get_current_project = {
        name: 'WS: getCurrentProject',
        options: [],
        callback: async () => { await sendWsRequest('getCurrentProject', [], '') },
      }
      defs.ws_get_network_interfaces = {
        name: 'WS: getNetworkInterfaces',
        options: [],
        callback: async () => { await sendWsRequest('getNetworkInterfaces', [], '') },
      }
      defs.ws_call_method = {
        name: 'WS: Call method (generic)',
        options: [
          { type: 'textinput', id: 'method', label: 'Method', default: 'getCurrentPreset' },
          { type: 'textinput', id: 'payload', label: 'Payload (JSON array)', default: '[]', useVariables: true },
          { type: 'textinput', id: 'uuid', label: 'UUID (optional, auto if blank)', default: '' },
        ],
        callback: async (action, context) => {
          const method = await context.parseVariablesInString(action.options.method)
          const payloadStr = await context.parseVariablesInString(action.options.payload)
          const uuid = await context.parseVariablesInString(action.options.uuid)
          let payload
          try {
            const parsed = JSON.parse(payloadStr || '[]')
            payload = Array.isArray(parsed) ? parsed : []
          } catch {
            payload = []
          }
          await sendWsRequest(method, payload, uuid || '')
        },
      }
    }

    // OSC actions (always available)
    defs.osc_send_blank = {
        name: 'OSC: Send message (no args)',
        options: [ { type: 'textinput', label: 'OSC Path', id: 'path', default: '/osc/path', useVariables: true } ],
        callback: async (action, context) => {
          const path = await context.parseVariablesInString(action.options.path)
          this.oscSend(path, [])
        }
      }
    defs.osc_get_value = {
        name: 'OSC: Get parameter value',
        options: [
          { type: 'dropdown', id: 'path_source', label: 'Path Source', width: 6, default: 'specs', choices: [
            { id: 'custom', label: 'Custom (manual input)' },
            { id: 'specs', label: 'From OSC specs (Parameter values)' },
          ]},
          { type: 'textinput', label: 'OSC Path (manual)', id: 'osc_path', default: '', isVisible: (opts) => opts.path_source === 'custom', useVariables: true },
          { type: 'dropdown', id: 'spec_path', label: 'OSC Spec Path', default: '', width: 12, isVisible: (opts) => opts.path_source === 'specs', choices: [{ id: '', label: '— Select —' }, ...getOscSpecChoices()] },
          // Common placeholder fields for better UX (optional)
          { type: 'textinput', label: 'speakerIndex (number)', id: 'ph_speakerIndex', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{speakerIndex\}/.test(opts.osc_path || '') : /\{speakerIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'index (number)', id: 'ph_index', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{index\}/.test(opts.osc_path || '') : /\{index\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'sourceId (number)', id: 'ph_sourceId', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{sourceId\}/.test(opts.osc_path || '') : /\{sourceId\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'busIndex (number)', id: 'ph_busIndex', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{busIndex\}/.test(opts.osc_path || '') : /\{busIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'trackIndex (number)', id: 'ph_trackIndex', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{trackIndex\}/.test(opts.osc_path || '') : /\{trackIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'channelIndex (number)', id: 'ph_channelIndex', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{channelIndex\}/.test(opts.osc_path || '') : /\{channelIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'filterIndex (number)', id: 'ph_filterIndex', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{filterIndex\}/.test(opts.osc_path || '') : /\{filterIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'bandIndex (number)', id: 'ph_bandIndex', default: '', width: 4, regex: Regex.SIGNED_NUMBER, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{bandIndex\}/.test(opts.osc_path || '') : /\{bandIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'source_type (string)', id: 'ph_source_type', default: '', width: 6, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{source_type\}/.test(opts.osc_path || '') : /\{source_type\}/.test(opts.spec_path || '')) },
        ],
        callback: async (action, context) => {
          const src = action.options.path_source || 'specs'
          const basePath = src === 'custom' ? (await context.parseVariablesInString(action.options.osc_path || '')).trim() : `${action.options.spec_path || ''}`
          if (!basePath) {
            this.log('warn', 'OSC get: path is required')
            return
          }
          // Resolve placeholders using explicit fields only
          const phMap = {}
          const explicit = {
            speakerIndex: await context.parseVariablesInString(action.options.ph_speakerIndex ?? ''),
            index: await context.parseVariablesInString(action.options.ph_index ?? ''),
            sourceId: await context.parseVariablesInString(action.options.ph_sourceId ?? ''),
            busIndex: await context.parseVariablesInString(action.options.ph_busIndex ?? ''),
            trackIndex: await context.parseVariablesInString(action.options.ph_trackIndex ?? ''),
            channelIndex: await context.parseVariablesInString(action.options.ph_channelIndex ?? ''),
            filterIndex: await context.parseVariablesInString(action.options.ph_filterIndex ?? ''),
            bandIndex: await context.parseVariablesInString(action.options.ph_bandIndex ?? ''),
            source_type: await context.parseVariablesInString(action.options.ph_source_type ?? ''),
          }
          for (const [k, v] of Object.entries(explicit)) {
            if (v !== undefined && v !== null && `${v}`.trim() !== '') phMap[k] = v
          }
          const chosen = resolvePathPlaceholders(basePath, phMap)
          // Holophonix may require the first segment to be a valid enum (track|stereo|...)
          // If the first segment is a list like {track,stereo}, expand into multiple /get calls.
          const m = chosen.match(/^\/\{([^}]+)\}(.*)$/)
          if (m) {
            const items = m[1].split(',').map((s) => s.trim()).filter(Boolean)
            const rest = m[2] || ''
            for (const it of items) {
              const expanded = `/${it}${rest}`
              this.oscSend('/get', [{ type: 's', value: expanded }])
            }
          } else {
            // Send /get with the path as a single string argument
            this.oscSend('/get', [{ type: 's', value: chosen }])
          }
        }
      }
    defs.osc_send_string = {
        name: 'OSC: Send string',
        options: [
          { type: 'textinput', label: 'OSC Path', id: 'path', default: '/osc/path', useVariables: true },
          { type: 'textinput', label: 'Value', id: 'string', default: 'text', useVariables: true },
        ],
        callback: async (action, context) => {
          const path = await context.parseVariablesInString(action.options.path)
          const value = await context.parseVariablesInString(action.options.string)
          this.oscSend(path, [{ type: 's', value: '' + value }])
        }
      }
    defs.osc_send_int = {
        name: 'OSC: Send integer',
        options: [
          { type: 'textinput', label: 'OSC Path', id: 'path', default: '/osc/path', useVariables: true },
          { type: 'textinput', label: 'Value', id: 'int', default: 1, regex: Regex.SIGNED_NUMBER, useVariables: true },
        ],
        callback: async (action, context) => {
          const path = await context.parseVariablesInString(action.options.path)
          const intv = await context.parseVariablesInString(action.options.int)
          this.oscSend(path, [{ type: 'i', value: parseInt(intv) }])
        }
      }
    defs.osc_send_float = {
        name: 'OSC: Send float',
        options: [
          { type: 'textinput', label: 'OSC Path', id: 'path', default: '/osc/path', useVariables: true },
          { type: 'textinput', label: 'Value', id: 'float', default: 1, regex: Regex.SIGNED_FLOAT, useVariables: true },
        ],
        callback: async (action, context) => {
          const path = await context.parseVariablesInString(action.options.path)
          const flt = await context.parseVariablesInString(action.options.float)
          this.oscSend(path, [{ type: 'f', value: parseFloat(flt) }])
        }
      }

    defs.osc_send_array = {
        name: 'OSC: Send array (JSON)',
        options: [
          { type: 'textinput', label: 'OSC Path', id: 'path', default: '/osc/path', useVariables: true },
          { type: 'textinput', label: 'Args (JSON array)', id: 'args', default: '[]', useVariables: true },
        ],
        callback: async (action, context) => {
          const path = await context.parseVariablesInString(action.options.path)
          const argsStr = await context.parseVariablesInString(action.options.args)
          let arr
          try { arr = JSON.parse(argsStr) } catch { arr = [] }
          const oscArgs = []
          if (Array.isArray(arr)) {
            for (const v of arr) {
              if (typeof v === 'number') {
                if (Number.isInteger(v)) oscArgs.push({ type: 'i', value: v })
                else oscArgs.push({ type: 'f', value: v })
              } else if (typeof v === 'boolean') {
                oscArgs.push({ type: 'i', value: v ? 1 : 0 })
              } else if (v && typeof v === 'object' && typeof v.type === 'string') {
                // Allow advanced users to pass pre-typed objects {type:'i'|'f'|'s', value:any}
                if ('value' in v) oscArgs.push({ type: v.type, value: v.value })
              } else {
                oscArgs.push({ type: 's', value: String(v) })
              }
            }
          }
          this.oscSend(path, oscArgs)
        }
      }

    this.setActionDefinitions(defs)
  }
}
