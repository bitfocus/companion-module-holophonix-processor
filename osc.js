import osc from 'osc'
import { InstanceStatus } from '@companion-module/base'

export function setupOSC(instance) {
  instance.oscSendPort = undefined
  instance.oscListenPort = undefined

  instance.initOSC = async function initOSC() {
    // Close existing
    try {
      if (this.oscListenPort) { this.oscListenPort.close(); this.oscListenPort = undefined }
      if (this.oscSendPort) { this.oscSendPort.close(); this.oscSendPort = undefined }
    } catch {}

    const host = this.config?.host
    const targetPort = Number(this.config?.targetPort)

    if (!host || !targetPort) {
      this.log('debug', 'OSC not configured (host/targetPort missing)')
      // If no WS either, we can reflect as BadConfig; otherwise, leave status as-is
    } else {
      // We use a single UDPPort for sending; osc library sends from a local port
      this.oscSendPort = new osc.UDPPort({ localAddress: '0.0.0.0', localPort: 0, metadata: true })
      this.oscSendPort.open()
      this.oscSendPort.on('ready', () => {
        this.log('debug', `OSC UDP send ready -> ${host}:${targetPort}`)
        // If listening is also configured or send is ready, we consider OSC operational
        this.updateStatus?.(InstanceStatus.Ok)
      })
      this.oscSendPort.on('error', (e) => this.log('error', `OSC send error: ${e?.message}`))

      if (this.config.listen && this.config.feedbackPort) {
        this.oscListenPort = new osc.UDPPort({ localAddress: '0.0.0.0', localPort: Number(this.config.feedbackPort), metadata: true })
        this.oscListenPort.on('message', (msg, timetag, info) => this.onOscMessage(msg, info))
        this.oscListenPort.on('ready', () => {
          this.log('debug', `OSC UDP listen ready on ${this.config.feedbackPort}`)
          this.updateStatus?.(InstanceStatus.Ok)
        })
        this.oscListenPort.on('error', (e) => this.log('error', `OSC listen error: ${e?.message}`))
        this.oscListenPort.open()
      }
    }
  }

  instance.onOscMessage = function onOscMessage(msg, info) {
    try {
      const path = msg.address
      const args = msg.args || []

      if (this.config.ignore_cpu_xrun) {
        const ignorePaths = new Set(['/dsp/cpu', '/cpu', '/dsp/xrun'])
        if (ignorePaths.has(path)) {
          // Suppress CPU/xrun telemetry
          this.log?.('debug', `OSC message ignored by CPU/Xrun filter: ${path}`)
          return
        }
      }

      // Update some variables akin to generic-osc
      const argsString = args.map((a) => (a?.value !== undefined ? a.value : a)).join(' ')
      this.setVariableValues({
        osc_latest_received_timestamp: Date.now(),
        osc_latest_received_raw: `${path} ${argsString}`,
        osc_latest_received_path: path,
        osc_latest_received_client: info?.address,
        osc_latest_received_port: info?.port,
        osc_latest_received_args: args.map((a) => (a?.value !== undefined ? a.value : a)),
      })

      // Basic boolean feedback trigger support will be defined in initFeedbacks()

      // Route to any osc_variable subscriptions
      if (this.oscSubscriptions && this.oscSubscriptions.size > 0) {
        const setValues = {}
        for (const [, sub] of this.oscSubscriptions) {
          try {
            if (!sub?.pattern || !sub?.variableName) continue
            if (sub.pattern.test(path)) {
              let val
              if (sub.valueMode === 'all') {
                const flat = args.map((a) => (a?.value !== undefined ? a.value : a))
                try {
                  val = JSON.stringify(flat)
                } catch {
                  val = `${flat}`
                }
              } else {
                const first = args[0]
                val = first?.value !== undefined ? first.value : first
                if (val === undefined) val = ''
              }
              setValues[sub.variableName] = val
            }
          } catch {}
        }
        if (Object.keys(setValues).length > 0) this.setVariableValues(setValues)
      }
    } catch (e) {
      this.log('error', `OSC message handling error: ${e?.message}`)
    }
  }

  instance.oscSend = function oscSend(path, args = []) {
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
        osc_latest_sent_timestamp: Date.now(),
        osc_latest_sent_raw: `${path} ${argsString}`,
        osc_latest_sent_path: path,
        osc_latest_sent_args: args.map((a) => (a?.value !== undefined ? a.value : a)),
      })
    } catch (e) {
      this.log('error', `OSC send error: ${e?.message}`)
    }
  }
}
