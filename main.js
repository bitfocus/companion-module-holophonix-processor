import { InstanceBase, runEntrypoint, InstanceStatus, Regex } from '@companion-module/base'
import WebSocket from 'ws'
import objectPath from 'object-path'
import osc from 'osc'

// Minimal upgrade scripts placeholder
import { upgradeScripts } from './upgrade.js'

class HolophonixProcessorInstance extends InstanceBase {
  // WebSocket
  ws = undefined
  wsReconnectTimer = undefined
  wsRegex = '^wss?:\\/\\/([\\da-z\\.-]+)(:\\d{1,5})?(?:\\/(.*))?$'

  // OSC
  oscSendPort = undefined // UDPPort for sending (we will use udp send via local UDPPort)
  oscListenPort = undefined // UDPPort for listening

  subscriptions = new Map()
  isInitialized = false

  async init(config) {
    this.config = config

    if (!this.config.fbprefix) this.config.fbprefix = ''
    if (!this.config.fbsuffix) this.config.fbsuffix = ''

    // Setup transports
    this.initWebSocket()
    await this.initOSC()

    this.isInitialized = true

    // UI export
    this.updateVariables()
    this.initActions()
    this.initFeedbacks()
    this.subscribeFeedbacks()
  }

  async destroy() {
    this.isInitialized = false

    // WS cleanup
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close(1000) } catch {}
      this.ws = undefined
    }

    // OSC cleanup
    try {
      if (this.oscListenPort) {
        this.oscListenPort.close()
        this.oscListenPort = undefined
      }
      if (this.oscSendPort) {
        this.oscSendPort.close()
        this.oscSendPort = undefined
      }
    } catch (e) {
      this.log('debug', `Error closing OSC ports: ${e?.message}`)
    }
  }

  async configUpdated(config) {
    const old = { ...this.config }
    this.config = config

    if (!this.config.fbprefix) this.config.fbprefix = ''
    if (!this.config.fbsuffix) this.config.fbsuffix = ''

    // Re-init transports if changed
    if (old.url !== config.url) this.initWebSocket()

    const oscChanged = old.host !== config.host || old.targetPort !== config.targetPort || old.listen !== config.listen || old.feedbackPort !== config.feedbackPort
    if (oscChanged) await this.initOSC()
  }

  // -------------------- WebSocket --------------------
  maybeReconnectWs() {
    if (this.isInitialized && this.config.ws_reconnect) {
      if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = setTimeout(() => this.initWebSocket(), 5000)
    }
  }

  initWebSocket() {
    const url = this.config?.url

    if (!url || url.match(new RegExp(this.wsRegex)) === null) {
      this.updateStatus(InstanceStatus.BadConfig, 'WS URL is not defined or invalid')
    } else {
      this.updateStatus(InstanceStatus.Connecting)
    }

    if (this.ws) {
      try { this.ws.close(1000) } catch {}
      this.ws = undefined
    }

    if (!url || url.match(new RegExp(this.wsRegex)) === null) return

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

  messageReceivedFromWebSocket(data) {
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

    this.subscriptions.forEach((subscription) => {
      const path = `${this.config.fbprefix}${subscription.subpath}${this.config.fbsuffix}`
      if (subscription.variableName === '') return

      if (subscription.subpath === '') {
        this.setVariableValues({ [subscription.variableName]: typeof msgValue === 'object' ? JSON.stringify(msgValue) : msgValue })
      } else if (typeof msgValue === 'object' && objectPath.has(msgValue, path)) {
        const value = objectPath.get(msgValue, path)
        this.setVariableValues({ [subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value })
      }
    })

    this.setVariableValues({ lastDataReceived: Date.now() })
  }

  // -------------------- OSC --------------------
  async initOSC() {
    // Close existing
    try {
      if (this.oscListenPort) { this.oscListenPort.close(); this.oscListenPort = undefined }
      if (this.oscSendPort) { this.oscSendPort.close(); this.oscSendPort = undefined }
    } catch {}

    const host = this.config?.host
    const targetPort = Number(this.config?.targetPort)

    if (!host || !targetPort) {
      this.log('debug', 'OSC not configured (host/targetPort missing)')
      // Keep instance status based on WS state; do not mark bad config if WS ok
    } else {
      // We use a single UDPPort for sending; osc library sends from a local port
      this.oscSendPort = new osc.UDPPort({ localAddress: '0.0.0.0', localPort: 0, metadata: true })
      this.oscSendPort.open()
      this.oscSendPort.on('ready', () => {
        this.log('debug', `OSC UDP send ready -> ${host}:${targetPort}`)
      })
      this.oscSendPort.on('error', (e) => this.log('error', `OSC send error: ${e?.message}`))

      if (this.config.listen && this.config.feedbackPort) {
        this.oscListenPort = new osc.UDPPort({ localAddress: '0.0.0.0', localPort: Number(this.config.feedbackPort), metadata: true })
        this.oscListenPort.on('message', (msg, timetag, info) => this.onOscMessage(msg, info))
        this.oscListenPort.on('ready', () => this.log('debug', `OSC UDP listen ready on ${this.config.feedbackPort}`))
        this.oscListenPort.on('error', (e) => this.log('error', `OSC listen error: ${e?.message}`))
        this.oscListenPort.open()
      }
    }
  }

  onOscMessage(msg, info) {
    try {
      const path = msg.address
      const args = msg.args || []

      // Update some variables akin to generic-osc
      const argsString = args.map((a) => (a?.value !== undefined ? a.value : a)).join(' ')
      this.setVariableValues({
        latest_received_timestamp: Date.now(),
        latest_received_raw: `${path} ${argsString}`,
        latest_received_path: path,
        latest_received_client: info?.address,
        latest_received_port: info?.port,
        latest_received_args: args.map((a) => (a?.value !== undefined ? a.value : a)),
      })

      // Basic boolean feedback trigger support will be defined in initFeedbacks()
    } catch (e) {
      this.log('error', `OSC message handling error: ${e?.message}`)
    }
  }

  oscSend(path, args = []) {
    if (!this.oscSendPort) {
      this.log('warn', 'OSC send attempted but OSC is not configured.')
      return
    }
    const host = this.config?.host
    const targetPort = Number(this.config?.targetPort)
    try {
      this.oscSendPort.send({ address: path, args }, host, targetPort)
      const argsString = args.map((a) => (a?.value !== undefined ? a.value : a)).join(' ')
      this.setVariableValues({
        latest_sent_timestamp: Date.now(),
        latest_sent_raw: `${path} ${argsString}`,
        latest_sent_path: path,
        latest_sent_args: args.map((a) => (a?.value !== undefined ? a.value : a)),
      })
    } catch (e) {
      this.log('error', `OSC send error: ${e?.message}`)
    }
  }

  // -------------------- UI/Actions/Feedbacks --------------------
  updateVariables(callerId = null) {
    const variables = new Set()
    const defaultValues = {}
    this.subscriptions.forEach((subscription, subscriptionId) => {
      if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) return
      variables.add(subscription.variableName)
      if (callerId === null || callerId === subscriptionId) defaultValues[subscription.variableName] = ''
    })

    const variableDefinitions = [
      { name: 'Timestamp when last WS data was received', variableId: 'lastDataReceived' },
      { variableId: 'latest_received_timestamp', name: 'Latest OSC message received timestamp' },
      { variableId: 'latest_received_raw', name: 'Latest OSC message received' },
      { variableId: 'latest_received_path', name: 'Latest OSC command received' },
      { variableId: 'latest_received_client', name: 'Latest OSC message received client (UDP only)' },
      { variableId: 'latest_received_port', name: 'Latest OSC message received port (UDP only)' },
      { variableId: 'latest_received_args', name: 'Latest OSC arguments received array.' },
      { variableId: 'latest_sent_timestamp', name: 'Latest OSC message sent timestamp' },
      { variableId: 'latest_sent_raw', name: 'Latest OSC message sent' },
      { variableId: 'latest_sent_path', name: 'Latest OSC command sent' },
      { variableId: 'latest_sent_args', name: 'Latest OSC arguments sent array.' },
    ]

    variables.forEach((variable) => {
      variableDefinitions.push({ name: variable, variableId: variable })
    })

    this.setVariableDefinitions(variableDefinitions)
    if (this.config.reset_variables) this.setVariableValues(defaultValues)
  }

  getConfigFields() {
    return [
      // Info
      { type: 'static-text', id: 'info', width: 12, label: 'Information', value: '<strong>Holophonix Processor</strong>: Combined WebSocket + OSC generic scaffolding.' },

      // WebSocket section
      { type: 'textinput', id: 'url', label: 'WebSocket URL', tooltip: 'ws[s]://domain[:port][/path]', width: 12, regex: '/' + this.wsRegex + '/' },
      { type: 'checkbox', id: 'ws_reconnect', label: 'WS Reconnect', tooltip: 'Reconnect on WebSocket error (after 5 secs)', width: 6, default: true },
      { type: 'dropdown', id: 'append_new_line', label: 'WS Append termination character', choices: [
        { id: '', label: 'None' }, { id: 'rn', label: 'Return+Newline' }, { id: 'nr', label: 'Newline+Return' }, { id: 'r', label: 'Return' }, { id: 'n', label: 'Newline' },
      ], width: 6, default: 'rn' },
      { type: 'checkbox', id: 'debug_messages', label: 'Debug messages', tooltip: 'Log incoming/outgoing WS messages', width: 6 },
      { type: 'checkbox', id: 'reset_variables', label: 'Reset variables', tooltip: 'Reset variables on init/connect', width: 6, default: true },
      { type: 'textinput', id: 'fbprefix', label: 'Feedback Prefix', default: '', width: 6, regex: '/^[\\w\\.\\-_+\\/\\\\\\$ ]*$/' },
      { type: 'textinput', id: 'fbsuffix', label: 'Feedback Suffix', default: '', width: 6, regex: '/^[\\w\\.\\-_+\\/\\\\\\$ ]*$/' },

      // OSC section
      { type: 'textinput', id: 'host', label: 'OSC Target Hostname or IP', width: 8, regex: Regex.HOSTNAME, required: false },
      { type: 'textinput', id: 'targetPort', label: 'OSC Target Port (UDP)', width: 4, regex: Regex.PORT, required: false },
      { type: 'checkbox', id: 'listen', label: 'Listen for OSC Feedback', width: 4, default: false },
      { type: 'textinput', id: 'feedbackPort', label: 'OSC Feedback Port (UDP)', width: 4, regex: Regex.PORT, isVisible: (options) => options.listen === true },
    ]
  }

  initFeedbacks() {
    this.setFeedbackDefinitions({
      websocket_variable: {
        type: 'advanced',
        name: 'Update variable with value from WebSocket message',
        description: 'Receive messages from the WebSocket and set the value to a variable.',
        options: [
          { type: 'textinput', label: 'JSON Path (blank if not json)', id: 'subpath', default: '' },
          { type: 'textinput', label: 'Variable', id: 'variable', regex: '/^[-a-zA-Z0-9_]+$/', default: '' },
        ],
        callback: () => ({ }),
        subscribe: (feedback) => {
          this.subscriptions.set(feedback.id, { variableName: `${feedback.options.variable}`, subpath: `${feedback.options.subpath}` })
          if (this.isInitialized) this.updateVariables(feedback.id)
        },
        unsubscribe: (feedback) => this.subscriptions.delete(feedback.id),
      },
    })
  }

  initActions() {
    this.setActionDefinitions({
      // WebSocket
      ws_send: {
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
      },

      // OSC
      osc_send_blank: {
        name: 'OSC: Send message (no args)',
        options: [ { type: 'textinput', label: 'OSC Path', id: 'path', default: '/osc/path', useVariables: true } ],
        callback: async (action, context) => {
          const path = await context.parseVariablesInString(action.options.path)
          this.oscSend(path, [])
        }
      },
      osc_send_string: {
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
      },
      osc_send_int: {
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
      },
      osc_send_float: {
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
      },
    })
  }
}

runEntrypoint(HolophonixProcessorInstance, upgradeScripts)
