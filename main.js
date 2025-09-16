import { InstanceBase, runEntrypoint } from '@companion-module/base'

// Minimal upgrade scripts placeholder
import { upgradeScripts } from './upgrade.js'
// Modularized setup imports
import { setupConfig, getConfigFields as exportedGetConfigFields } from './config.js'
import { setupVariables } from './variables.js'
import { setupActions } from './actions.js'
import { setupFeedbacks } from './feedbacks.js'
import { setupPresets } from './presets.js'
import { setupWebSocket } from './websocket.js'
import { setupOSC } from './osc.js'
import { setupOSCActions } from './osc_actions.js'

class HolophonixProcessorInstance extends InstanceBase {
  subscriptions = new Map()
  isInitialized = false

  // Provide config fields early for the base, before init() is called
  getConfigFields() {
    return exportedGetConfigFields()
  }

  async init(config) {
    this.config = config

    if (!this.config.fbprefix) this.config.fbprefix = ''
    if (!this.config.fbsuffix) this.config.fbsuffix = ''

    // Attach modular behavior onto this instance
    setupConfig(this)
    setupVariables(this)
    setupActions(this)
    setupOSCActions(this)
    setupFeedbacks(this)
    setupPresets(this)
    setupWebSocket(this)
    setupOSC(this)

    // Setup transports (OSC first as primary)
    await this.initOSC()
    this.initWebSocket()

    this.isInitialized = true

    // UI export
    this.updateVariables()
    this.initActions()
    this.initFeedbacks()
    this.initPresets?.()
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
    if (old.host !== config.host || old.enable_websocket !== config.enable_websocket || old.ws_reconnect !== config.ws_reconnect) this.initWebSocket()

    const oscChanged = old.host !== config.host || old.targetPort !== config.targetPort || old.listen !== config.listen || old.feedbackPort !== config.feedbackPort
    if (oscChanged) await this.initOSC()
  }
}

runEntrypoint(HolophonixProcessorInstance, upgradeScripts)
