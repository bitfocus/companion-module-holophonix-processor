import WebSocket from 'ws'
import objectPath from 'object-path'
import { InstanceStatus } from '@companion-module/base'

export function setupWebSocket(instance) {
  instance.ws = undefined
  instance.wsReconnectTimer = undefined
  instance.wsResponses = new Map()

  instance.maybeReconnectWs = function maybeReconnectWs() {
    const host = (this.config?.host || '').trim()
    if (this.isInitialized && this.config.enable_websocket && this.config.ws_reconnect && host) {
      if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = setTimeout(() => this.initWebSocket(), 5000)
    }
  }

  instance.initWebSocket = function initWebSocket() {
    const host = (this.config?.host || '').trim()

    // Always close any existing socket first
    if (this.ws) {
      try { this.ws.close(1000) } catch {}
      this.ws = undefined
    }

    // Treat disabled or empty host as 'WebSocket disabled' without impacting module status
    if (!this.config.enable_websocket || !host) {
      this.log('debug', 'WS disabled (no host configured)')
      return
    }

    this.updateStatus(InstanceStatus.Connecting)

    // Build ws URL to default port 29175
    let url = `ws://${host}`
    try {
      const u = new URL(url)
      if (!u.port) u.port = '29175'
      url = u.toString()
    } catch {}

    this.ws = new WebSocket(url)

    this.ws.on('open', () => {
      this.updateStatus(InstanceStatus.Ok)
      this.log('debug', 'WS connection opened')
      if (this.config.reset_variables) this.updateVariables()
    })

    this.ws.on('close', (code) => {
      this.log('debug', `WS connection closed (${code})`)
      this.updateStatus(InstanceStatus.Disconnected, `WS closed (${code})`)
      this.maybeReconnectWs()
    })

    this.ws.on('message', this.messageReceivedFromWebSocket.bind(this))

    this.ws.on('error', (err) => {
      this.log('error', `WebSocket error: ${err}`)
    })
  }

  instance.messageReceivedFromWebSocket = function messageReceivedFromWebSocket(data) {
    const rawInput = data
    if (this.config.debug_messages) this.log('debug', `WS Message received: ${data}`)

    let msgValue = null
    if (Buffer.isBuffer(data)) data = data.toString()

    if (typeof data === 'object') {
      msgValue = data
    } else {
      try {
        msgValue = JSON.parse(data)
      } catch (e) {
        msgValue = data
      }
    }

    // Optional filtering of CPU/Xrun telemetry
    if (this.config.ignore_cpu_xrun) {
      const ignorePaths = new Set(['/dsp/cpu', '/cpu', '/dsp/xrun'])

      // Case 1: array of entries like [ ["/path", [args]], ... ]
      if (Array.isArray(msgValue) && msgValue.every((e) => Array.isArray(e) && typeof e[0] === 'string')) {
        const filtered = msgValue.filter((e) => !ignorePaths.has(e[0]))
        if (filtered.length === 0) {
          // Entire message was ignored
          if (this.config.debug_messages) this.log('debug', 'WS message ignored by CPU/Xrun filter (array form)')
          this.setVariableValues({ lastDataReceived: Date.now() })
          return
        }
        msgValue = filtered
      }

      // Case 2: object form with a single path
      if (msgValue && typeof msgValue === 'object' && typeof msgValue.address === 'string' && ignorePaths.has(msgValue.address)) {
        if (this.config.debug_messages) this.log('debug', `WS message ignored by CPU/Xrun filter (object form): ${msgValue.address}`)
        this.setVariableValues({ lastDataReceived: Date.now() })
        return
      }
    }

    // Unwrap known envelope format: [ { method, payload, uuid } ]
    let respUuid = ''
    let respMethod = ''
    let core = msgValue
    if (msgValue && typeof msgValue === 'object') {
      if (Array.isArray(msgValue) && msgValue.length > 0 && typeof msgValue[0] === 'object') {
        const first = msgValue[0]
        if (first && typeof first === 'object') {
          if (typeof first.uuid === 'string') respUuid = first.uuid
          if (typeof first.method === 'string') respMethod = first.method
          if (first.payload !== undefined) core = first.payload
        }
      } else if (typeof msgValue.uuid === 'string' || typeof msgValue.method === 'string') {
        respUuid = typeof msgValue.uuid === 'string' ? msgValue.uuid : ''
        respMethod = typeof msgValue.method === 'string' ? msgValue.method : ''
        if (msgValue.payload !== undefined) core = msgValue.payload
      }
    }

    // Build a filtered view using active subscriptions (used for variables and optional debug)
    let filteredObj = null
    if (core && typeof core === 'object') {
      filteredObj = {}
      this.subscriptions.forEach((subscription) => {
        const subpath = `${this.config.fbprefix}${subscription.subpath}${this.config.fbsuffix}`
        if (subscription.subpath === '') {
          filteredObj[subscription.variableName || '(unnamed)'] = core
        } else if (objectPath.has(core, subpath)) {
          const v = objectPath.get(core, subpath)
          filteredObj[subscription.variableName || subpath] = v
        }
      })
    }

    // Populate WebSocket-related variables
    try {
      const rawString = Buffer.isBuffer(rawInput)
        ? rawInput.toString()
        : typeof rawInput === 'string'
          ? rawInput
          : (() => { try { return JSON.stringify(rawInput) } catch { return String(rawInput) } })()
      const jsonString = core && typeof core === 'object' ? JSON.stringify(core) : ''
      const filteredString = filteredObj ? JSON.stringify(filteredObj) : ''
      const nowTs = Date.now()
      const vars = {
        ws_latest_received_timestamp: nowTs,
        ws_latest_received_raw: rawString,
        ws_latest_received_json: jsonString,
        ws_latest_received_filtered: filteredString,
      }

      // Correlate responses by uuid/method when present
      if (respUuid) {
        try { this.wsResponses.set(respUuid, core ?? msgValue) } catch {}
        vars.ws_latest_response_uuid = respUuid
      }
      if (respMethod) {
        vars.ws_latest_response_method = respMethod
      }
      if (respUuid || respMethod) {
        try {
          const s = JSON.stringify(core ?? msgValue)
          vars.ws_latest_response_json = s
        } catch {
          vars.ws_latest_response_json = ''
        }
      }

      this.setVariableValues(vars)
    } catch {}

    // Debug: pretty print parsed JSON and filtered content for active subscriptions
    if (this.config.debug_messages) {
      try {
        if (typeof core === 'object') {
          this.log('debug', `WS Parsed JSON (core payload):\n${JSON.stringify(core, null, 2)}`)
          this.log('debug', `WS Filtered (by active subscriptions):\n${JSON.stringify(filteredObj ?? {}, null, 2)}`)
        } else {
          this.log('debug', `WS Non-JSON payload kept as string`)
        }
      } catch (e) {
        this.log('debug', `WS debug formatting error: ${e?.message}`)
      }
    }

    this.subscriptions.forEach((subscription) => {
      const path = `${this.config.fbprefix}${subscription.subpath}${this.config.fbsuffix}`
      if (subscription.variableName === '') return

      if (subscription.subpath === '') {
        const val = core ?? msgValue
        this.setVariableValues({ [subscription.variableName]: typeof val === 'object' ? JSON.stringify(val) : val })
      } else if (core && typeof core === 'object' && objectPath.has(core, path)) {
        const value = objectPath.get(core, path)
        this.setVariableValues({ [subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value })
      }
    })
  }
}
