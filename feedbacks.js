import presetPaths from './utils/ws_paths_preset.js'
import projectPaths from './utils/ws_paths_project.js'
import netPaths from './utils/ws_paths_net.js'
import getOscSpecPaths, { getOscSpecChoices, getFileScopes } from './utils/osc_paths_specs.js'
import { resolvePathPlaceholders } from './utils/osc_utils.js'

export function setupFeedbacks(instance) {
  instance.initFeedbacks = function initFeedbacks() {
    const defs = {}

    // Conditionally include WS feedbacks only when enabled
    if (this.config?.enable_websocket) {
      defs.websocket_variable = {
        type: 'advanced',
        name: 'Update variable with value from WebSocket message',
        description: 'Receive messages from the WebSocket and set the value to a variable.',
        options: [
          { type: 'dropdown', id: 'path_source', label: 'Path Source', width: 6, default: 'custom', choices: [
            { id: 'custom', label: 'Custom (manual input)' },
            { id: 'preset', label: 'Preset response paths' },
            { id: 'project', label: 'Project response paths' },
            { id: 'net', label: 'Net response paths' },
          ]},
          { type: 'textinput', label: 'JSON Path (manual)', id: 'subpath', default: '', isVisible: (opts) => opts.path_source === 'custom' },
          { type: 'dropdown', id: 'preset_path', label: 'Preset JSON Path', default: '', width: 12, isVisible: (opts) => opts.path_source === 'preset', choices: [{ id: '', label: '— Select —' }, ...presetPaths.map((p) => ({ id: p, label: p }))] },
          { type: 'dropdown', id: 'project_path', label: 'Project JSON Path', default: '', width: 12, isVisible: (opts) => opts.path_source === 'project', choices: [{ id: '', label: '— Select —' }, ...projectPaths.map((p) => ({ id: p, label: p }))] },
          { type: 'dropdown', id: 'net_path', label: 'Net JSON Path', default: '', width: 12, isVisible: (opts) => opts.path_source === 'net', choices: [{ id: '', label: '— Select —' }, ...netPaths.map((p) => ({ id: p, label: p }))] },
          { type: 'textinput', label: 'Variable', id: 'variable', regex: '/^[-a-zA-Z0-9_]+$/', default: '' },
        ],
        callback: () => ({}),
        subscribe: (feedback) => {
          // Prevent collisions with reserved variable IDs
          const reserved = new Set([
            // WS received
            'ws_latest_received_timestamp','ws_latest_received_raw','ws_latest_received_json','ws_latest_received_filtered',
            // WS request/response
            'ws_latest_request_uuid','ws_latest_request_method','ws_latest_request_payload',
            'ws_latest_response_uuid','ws_latest_response_method','ws_latest_response_json',
            // OSC received/sent
            'osc_latest_received_timestamp','osc_latest_received_raw','osc_latest_received_path','osc_latest_received_client','osc_latest_received_port','osc_latest_received_args',
            'osc_latest_sent_timestamp','osc_latest_sent_raw','osc_latest_sent_path','osc_latest_sent_args',
          ])

          let requestedName = `${feedback.options.variable}`
          let safeName = requestedName
          if (reserved.has(requestedName)) {
            safeName = `ws_${requestedName}`
            this.log?.('warn', `Variable name '${requestedName}' is reserved. Using '${safeName}' instead.`)
          }

          // Resolve effective subpath from selected source
          let effectiveSubpath = ''
          const src = feedback.options.path_source || 'custom'
          if (src === 'custom') {
            effectiveSubpath = `${feedback.options.subpath || ''}`
          } else if (src === 'preset') {
            effectiveSubpath = `${feedback.options.preset_path || ''}`
          } else if (src === 'project') {
            effectiveSubpath = `${feedback.options.project_path || ''}`
          } else if (src === 'net') {
            effectiveSubpath = `${feedback.options.net_path || ''}`
          }

          this.subscriptions.set(feedback.id, { variableName: safeName, subpath: effectiveSubpath })
          if (this.isInitialized) this.updateVariables(feedback.id)
        },
        unsubscribe: (feedback) => this.subscriptions.delete(feedback.id),
      }
    }

    // ---------------- Scoped OSC feedbacks (per JSON file) ----------------
    const fileScopes = getFileScopes()
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

    // Variable feedback per scope
    fileScopes.forEach((scope, scopeIndex) => {
      defs[`osc_variable_scope_${scopeIndex}`] = {
        type: 'advanced',
        name: `Update variable from OSC (${scope.label})`,
        description: 'Match incoming OSC to the selected path and update a variable.',
        options: [
          { type: 'dropdown', id: 'grouped_path', label: 'OSC Path', width: 12, choices: [{ id: '', label: '— Select —' }, ...scope.choices] },
          // Explicit placeholders (pure-opts visibility)
          { type: 'textinput', label: 'speakerIndex (number)', id: `ph_speakerIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{speakerIndex}') },
          { type: 'textinput', label: 'trackIndex (number)', id: `ph_trackIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{trackIndex}') },
          { type: 'textinput', label: 'index (number)', id: `ph_index_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{index}') },
          { type: 'textinput', label: 'filterIndex (number)', id: `ph_filterIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{filterIndex}') },
          { type: 'textinput', label: 'busIndex (number)', id: `ph_busIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{busIndex}') },
          { type: 'textinput', label: 'channelIndex (number)', id: `ph_channelIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{channelIndex}') },
          { type: 'textinput', label: 'bandIndex (number)', id: `ph_bandIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{bandIndex}') },
          { type: 'textinput', label: 'sourceId (number)', id: `ph_sourceId_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{sourceId}') },
          { type: 'textinput', label: 'id (number)', id: `ph_id_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{id}') },
          { type: 'textinput', label: 'source_type (string)', id: `ph_source_type_${scopeIndex}`, default: '', width: 6, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{source_type}') },
          { type: 'dropdown', id: `value_mode_${scopeIndex}`, label: 'Value Mode', width: 6, default: 'first', choices: [
            { id: 'first', label: 'First arg' },
            { id: 'all', label: 'All args (JSON)' },
          ]},
          { type: 'textinput', label: 'Variable', id: `variable_${scopeIndex}`, regex: '/^[-a-zA-Z0-9_]+$/', default: 'auto' },
        ],
        callback: () => ({}),
        subscribe: (feedback) => {
          if (!this.oscSubscriptions) this.oscSubscriptions = new Map()
          const rawPath = `${feedback.options.grouped_path || ''}`
          const phMap = {}
          for (const key of explicitPhKeys) {
            const v = feedback.options[`ph_${key}_${scopeIndex}`]
            if (v !== undefined && v !== null && `${v}` !== '') phMap[key] = v
          }
          const pathStr = resolvePathPlaceholders(rawPath, phMap)
          let requestedName = `${feedback.options[`variable_${scopeIndex}`]}`
          if (!requestedName || requestedName.toLowerCase() === 'auto') {
            const cleaned = String(pathStr || '')
              .replace(/^\//, '')
              .replace(/[{}]/g, '')
              .replace(/\//g, '_')
              .replace(/[^-a-zA-Z0-9_]/g, '_')
              .slice(0, 64)
            requestedName = cleaned ? `osc_${cleaned}` : 'osc_value'
          }
          const pattern = makeOscRegex(pathStr)
          const valueMode = feedback.options[`value_mode_${scopeIndex}`] || 'first'
          this.oscSubscriptions.set(feedback.id, { variableName: requestedName, path: pathStr, pattern, valueMode })
          this.updateVariables?.(feedback.id)
        },
        unsubscribe: (feedback) => {
          this.oscSubscriptions?.delete(feedback.id)
          this.updateVariables?.()
        },
      }
    })

    // Boolean compare feedback per scope
    fileScopes.forEach((scope, scopeIndex) => {
      defs[`osc_value_compare_scope_${scopeIndex}`] = {
        type: 'boolean',
        name: `OSC value compare (${scope.label})`,
        description: 'Compare incoming OSC at the selected path against an expected value.',
        options: [
          { type: 'dropdown', id: 'grouped_path', label: 'OSC Path', width: 12, choices: [{ id: '', label: '— Select —' }, ...scope.choices] },
          // Explicit placeholders
          { type: 'textinput', label: 'speakerIndex (number)', id: `ph_speakerIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{speakerIndex}') },
          { type: 'textinput', label: 'trackIndex (number)', id: `ph_trackIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{trackIndex}') },
          { type: 'textinput', label: 'index (number)', id: `ph_index_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{index}') },
          { type: 'textinput', label: 'filterIndex (number)', id: `ph_filterIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{filterIndex}') },
          { type: 'textinput', label: 'busIndex (number)', id: `ph_busIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{busIndex}') },
          { type: 'textinput', label: 'channelIndex (number)', id: `ph_channelIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{channelIndex}') },
          { type: 'textinput', label: 'bandIndex (number)', id: `ph_bandIndex_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{bandIndex}') },
          { type: 'textinput', label: 'sourceId (number)', id: `ph_sourceId_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{sourceId}') },
          { type: 'textinput', label: 'id (number)', id: `ph_id_${scopeIndex}`, default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{id}') },
          { type: 'textinput', label: 'source_type (string)', id: `ph_source_type_${scopeIndex}`, default: '', width: 6, useVariables: true, isVisible: (opts) => !!(opts.grouped_path) && String(opts.grouped_path).includes('{source_type}') },
          { type: 'dropdown', id: `arg_index_${scopeIndex}`, label: 'Argument index', width: 4, default: 0, choices: [
            { id: 0, label: '0' }, { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }, { id: 4, label: '4' },
          ]},
          { type: 'dropdown', id: `operator_${scopeIndex}`, label: 'Operator', width: 6, default: 'eq', choices: [
            { id: 'eq', label: 'equals (==)' },
            { id: 'ne', label: 'not equals (!=)' },
            { id: 'gt', label: 'greater than (>) [number]' },
            { id: 'lt', label: 'less than (<) [number]' },
            { id: 'contains', label: 'contains [string]' },
            { id: 'regex', label: 'regex match [string]' },
          ]},
          { type: 'textinput', id: `expected_${scopeIndex}`, label: 'Expected value', width: 12, default: '' },
        ],
        defaultStyle: { bgcolor: 0, color: 16777215 },
        callback: (feedback, context) => {
          const rawPath = `${feedback.options.grouped_path || ''}`
          if (!rawPath) return false
          const phMap = {}
          for (const key of explicitPhKeys) {
            const v = feedback.options[`ph_${key}_${scopeIndex}`]
            if (v !== undefined && v !== null && `${v}` !== '') phMap[key] = v
          }
          const pathStr = resolvePathPlaceholders(rawPath, phMap)
          const pattern = makeOscRegex(pathStr)
          const lastPath = this.getVariableValue?.('osc_latest_received_path') || ''
          if (!pattern.test(String(lastPath))) return false
          const idx = Number(feedback.options[`arg_index_${scopeIndex}`] || 0)
          const args = this.getVariableValue?.('osc_latest_received_args')
          let arr
          try { arr = typeof args === 'string' ? JSON.parse(args) : Array.isArray(args) ? args : [] } catch { arr = [] }
          const raw = arr[idx]
          const actual = raw?.value !== undefined ? raw.value : raw
          const op = String(feedback.options[`operator_${scopeIndex}`] || 'eq')
          const expectedRaw = String(feedback.options[`expected_${scopeIndex}`] ?? '')
          if (op === 'gt' || op === 'lt') {
            const a = Number(actual); const b = Number(expectedRaw)
            if (Number.isNaN(a) || Number.isNaN(b)) return false
            return op === 'gt' ? a > b : a < b
          }
          if (op === 'contains') return String(actual).includes(expectedRaw)
          if (op === 'regex') { try { return new RegExp(expectedRaw).test(String(actual)) } catch { return false } }
          const aNum = Number(actual); const bNum = Number(expectedRaw)
          const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum)
          const res = bothNumeric ? aNum === bNum : String(actual) === expectedRaw
          return op === 'eq' ? res : !res
        },
      }
    })

    defs.osc_variable = {
        type: 'advanced',
        name: 'Update variable with value from OSC message',
        description: 'Match incoming OSC messages to a path (exact or placeholder pattern) and set a variable to the received value(s).',
        options: [
          { type: 'dropdown', id: 'path_source', label: 'OSC Path Source', width: 6, default: 'specs', choices: [
            { id: 'custom', label: 'Custom (manual input)' },
            { id: 'specs', label: 'From OSC specs (Parameter values)' },
          ]},
          { type: 'textinput', label: 'OSC Path (manual)', id: 'osc_path', default: '', isVisible: (opts) => opts.path_source === 'custom' },
          { type: 'dropdown', id: 'spec_path', label: 'OSC Spec Path', default: '', width: 12, isVisible: (opts) => opts.path_source === 'specs', choices: [{ id: '', label: '— Select —' }, ...getOscSpecChoices()] },
          // Common placeholder fields for better UX (optional)
          { type: 'textinput', label: 'speakerIndex (number)', id: 'ph_speakerIndex', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{speakerIndex\}/.test(opts.osc_path || '') : /\{speakerIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'index (number)', id: 'ph_index', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{index\}/.test(opts.osc_path || '') : /\{index\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'sourceId (number)', id: 'ph_sourceId', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{sourceId\}/.test(opts.osc_path || '') : /\{sourceId\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'busIndex (number)', id: 'ph_busIndex', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{busIndex\}/.test(opts.osc_path || '') : /\{busIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'trackIndex (number)', id: 'ph_trackIndex', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{trackIndex\}/.test(opts.osc_path || '') : /\{trackIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'channelIndex (number)', id: 'ph_channelIndex', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{channelIndex\}/.test(opts.osc_path || '') : /\{channelIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'filterIndex (number)', id: 'ph_filterIndex', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{filterIndex\}/.test(opts.osc_path || '') : /\{filterIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'bandIndex (number)', id: 'ph_bandIndex', default: '', width: 4, regex: '/^-?[0-9]+$/', useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{bandIndex\}/.test(opts.osc_path || '') : /\{bandIndex\}/.test(opts.spec_path || '')) },
          { type: 'textinput', label: 'source_type (string)', id: 'ph_source_type', default: '', width: 6, useVariables: true, isVisible: (opts) => (opts.path_source === 'custom' ? /\{source_type\}/.test(opts.osc_path || '') : /\{source_type\}/.test(opts.spec_path || '')) },
          { type: 'dropdown', id: 'value_mode', label: 'Value Mode', width: 6, default: 'first', choices: [
            { id: 'first', label: 'First arg' },
            { id: 'all', label: 'All args (JSON)' },
          ]},
          { type: 'textinput', label: 'Variable', id: 'variable', regex: '/^[-a-zA-Z0-9_]+$/', default: 'auto', tooltip: 'Type a name or leave as "auto" to generate one from the OSC path.' },
        ],
        callback: () => ({}),
        subscribe: (feedback) => {
          if (!this.oscSubscriptions) this.oscSubscriptions = new Map()

          const reserved = new Set([
            'ws_latest_received_timestamp','ws_latest_received_raw','ws_latest_received_json','ws_latest_received_filtered',
            'ws_latest_request_uuid','ws_latest_request_method','ws_latest_request_payload',
            'ws_latest_response_uuid','ws_latest_response_method','ws_latest_response_json',
            'osc_latest_received_timestamp','osc_latest_received_raw','osc_latest_received_path','osc_latest_received_client','osc_latest_received_port','osc_latest_received_args',
            'osc_latest_sent_timestamp','osc_latest_sent_raw','osc_latest_sent_path','osc_latest_sent_args',
          ])

          // Resolve base path from selection
          const src = feedback.options.path_source || 'specs'
          const rawPath = src === 'custom' ? `${feedback.options.osc_path || ''}` : `${feedback.options.spec_path || ''}`

          // Apply placeholder values from explicit fields only
          const phMap = {}
          const explicit = {
            speakerIndex: feedback.options.ph_speakerIndex,
            index: feedback.options.ph_index,
            sourceId: feedback.options.ph_sourceId,
            busIndex: feedback.options.ph_busIndex,
            trackIndex: feedback.options.ph_trackIndex,
            channelIndex: feedback.options.ph_channelIndex,
            filterIndex: feedback.options.ph_filterIndex,
            bandIndex: feedback.options.ph_bandIndex,
            source_type: feedback.options.ph_source_type,
          }
          for (const [k, v] of Object.entries(explicit)) {
            if (v !== undefined && v !== null && `${v}` !== '') phMap[k] = v
          }
          const pathStr = resolvePathPlaceholders(rawPath, phMap)

          // Variable naming: if user left blank or 'auto', generate from path
          let requestedName = `${feedback.options.variable}`
          if (!requestedName || requestedName.toLowerCase() === 'auto') {
            const cleaned = String(pathStr || '')
              .replace(/^\//, '')
              .replace(/[{}]/g, '')
              .replace(/\//g, '_')
              .replace(/[^-a-zA-Z0-9_]/g, '_')
              .slice(0, 64)
            requestedName = cleaned ? `osc_${cleaned}` : 'osc_value'
          }
          let safeName = requestedName
          if (reserved.has(requestedName)) {
            safeName = `osc_${requestedName}`
            this.log?.('warn', `Variable name '${requestedName}' is reserved. Using '${safeName}' instead.`)
          }

          const pattern = makeOscRegex(pathStr)
          const valueMode = feedback.options.value_mode || 'first'
          this.oscSubscriptions.set(feedback.id, { variableName: safeName, path: pathStr, pattern, valueMode })
          // Ensure the variable is registered immediately so feedbacks can reference it
          this.updateVariables?.(feedback.id)
        },
        unsubscribe: (feedback) => {
          this.oscSubscriptions?.delete(feedback.id)
          // Refresh variables to drop any now-unused variable definitions
          this.updateVariables?.()
        },
      }

    defs.osc_value_compare = {
      type: 'boolean',
      name: 'OSC value compare',
      description: 'Compare the value(s) of incoming OSC messages at a path/pattern against an expected value. Supports ?, *, [ranges], {lists}.',
      options: [
        { type: 'textinput', label: 'OSC Path or Pattern', id: 'pattern', width: 12, default: '' },
        { type: 'dropdown', id: 'arg_index', label: 'Argument index', width: 4, default: 0, choices: [
          { id: 0, label: '0' }, { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }, { id: 4, label: '4' },
        ]},
        { type: 'dropdown', id: 'operator', label: 'Operator', width: 6, default: 'eq', choices: [
          { id: 'eq', label: 'equals (==)' },
          { id: 'ne', label: 'not equals (!=)' },
          { id: 'gt', label: 'greater than (>) [number]' },
          { id: 'lt', label: 'less than (<) [number]' },
          { id: 'contains', label: 'contains [string]' },
          { id: 'regex', label: 'regex match [string]' },
        ]},
        { type: 'textinput', id: 'expected', label: 'Expected value', width: 12, default: '' },
      ],
      defaultStyle: { bgcolor: 0, color: 16777215 },
      callback: (feedback, context) => {
        const pat = String(feedback.options.pattern || '')
        if (!pat) return false
        const pattern = makeOscRegex(pat)
        const lastPath = this.getVariableValue?.('osc_latest_received_path') || ''
        if (!pattern.test(String(lastPath))) return false
        const idx = Number(feedback.options.arg_index || 0)
        const args = this.getVariableValue?.('osc_latest_received_args')
        let arr
        try { arr = typeof args === 'string' ? JSON.parse(args) : Array.isArray(args) ? args : [] } catch { arr = [] }
        const raw = arr[idx]
        const actual = raw?.value !== undefined ? raw.value : raw
        const op = String(feedback.options.operator || 'eq')
        const expectedRaw = String(feedback.options.expected ?? '')

        // Numeric ops use number coercion; string ops use string
        if (op === 'gt' || op === 'lt') {
          const a = Number(actual)
          const b = Number(expectedRaw)
          if (Number.isNaN(a) || Number.isNaN(b)) return false
          return op === 'gt' ? a > b : a < b
        }
        if (op === 'contains') {
          return String(actual).includes(expectedRaw)
        }
        if (op === 'regex') {
          try { return new RegExp(expectedRaw).test(String(actual)) } catch { return false }
        }
        // eq/ne with smart coercion: if both numeric-like, compare as numbers; else string compare
        const aNum = Number(actual)
        const bNum = Number(expectedRaw)
        const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum)
        const res = bothNumeric ? aNum === bNum : String(actual) === expectedRaw
        return op === 'eq' ? res : !res
      },
    }

    // Debug: log how many scoped feedbacks we built
    try {
      const keys = Object.keys(defs)
      this.log?.('debug', `Registering ${keys.length} feedback definitions`)
    } catch {}
    this.setFeedbackDefinitions(defs)
  }

  // Keep the method that main.js expects, even if no-op for now
  instance.subscribeFeedbacks = function subscribeFeedbacks() {
    // No-op: feedbacks subscribe automatically via definitions above
  }
}

// Convert an OSC path with placeholders and wildcards to a regex for matching incoming OSC addresses
// Supports:
// - Placeholders: {foo} -> [^/]+ (single segment)
// - Lists: {a,b,c} -> (a|b|c)
// - Single-char wildcard: ? -> .
// - Multi-char wildcard: * -> .*
// - Ranges/sets: [1-5], [abc] are preserved
// Example: /speaker/{speakerIndex}/routing/output/{index}/master -> ^/speaker/[^/]+/routing/output/[^/]+/master$
// Example: /{track,stereo}/*/mute -> ^/(track|stereo)/.*/mute$
function makeOscRegex(path) {
  if (!path || typeof path !== 'string') return new RegExp('^$')

  // Escape regex special chars, but keep OSC wildcards and braces/brackets we will process: ? * { } [ ] /
  let expr = path.replace(/[.+^$()|\\]/g, '\\$&')

  // Handle lists {a,b,c} first to avoid collision with placeholders
  expr = expr.replace(/\{([^}]*?,[^}]*?)\}/g, (m, inner) => {
    const items = inner.split(',').map((s) => s.trim()).filter(Boolean)
    const safe = items.map((s) => s.replace(/[.+^$()|\\]/g, '\\$&'))
    return `(${safe.join('|')})`
  })

  // Placeholders {foo} (no comma inside) -> segment wildcard
  expr = expr.replace(/\{([^,}]+)\}/g, '[^/]+')

  // Translate wildcards: ? -> ., * -> .*
  expr = expr.replace(/\?/g, '.').replace(/\*/g, '.*')

  // Bracket expressions [ ... ] are already literal in expr; leave as-is

  return new RegExp(`^${expr}$`)
}
