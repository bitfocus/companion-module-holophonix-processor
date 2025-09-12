import { Regex } from '@companion-module/base'

export function setupConfig(instance) {
  // Optional place to attach shared constants; not required for config rendering
  instance.wsRegex = '^ws:\/\/([\da-z\.-]+)(:\d{1,5})?(?:\/(.*))?$'
  // The base calls `this.getConfigFields()` on the instance before init completes.
  // Attach our config fields provider onto the instance here.
  instance.getConfigFields = getConfigFields
}

export function getConfigFields() {
  return [
    // Info
    { type: 'static-text', id: 'info', width: 12, label: 'Information', value: '<strong>Holophonix Processor</strong>: Combined WebSocket + OSC generic scaffolding.' },

    // WebSocket section
    { type: 'checkbox', id: 'enable_websocket', label: 'Enable WebSocket', tooltip: 'If disabled, this module will operate using OSC only.', width: 6, default: false },
    { type: 'textinput', id: 'ws_host', label: 'Holophonix Hostname or IP (WS)', tooltip: 'Hostname or IPv4/IPv6 only. Port is fixed to 29175 and scheme is ws://', width: 12, regex: Regex.HOSTNAME, isVisible: (opt) => opt.enable_websocket === true },
    { type: 'checkbox', id: 'ws_reconnect', label: 'WS Reconnect', tooltip: 'Reconnect on WebSocket error (after 5 secs)', width: 6, default: true, isVisible: (opt) => opt.enable_websocket === true },
    { type: 'dropdown', id: 'append_new_line', label: 'WS Append termination character', choices: [
      { id: '', label: 'None' }, { id: 'rn', label: 'Return+Newline' }, { id: 'nr', label: 'Newline+Return' }, { id: 'r', label: 'Return' }, { id: 'n', label: 'Newline' },
    ], width: 6, default: 'rn', isVisible: (opt) => opt.enable_websocket === true },
    { type: 'checkbox', id: 'debug_messages', label: 'Debug messages', tooltip: 'Log incoming/outgoing WS messages', width: 6, isVisible: (opt) => opt.enable_websocket === true },
    { type: 'checkbox', id: 'ignore_cpu_xrun', label: 'Ignore CPU/Xrun telemetry', tooltip: 'Filter out /dsp/cpu, /cpu, /dsp/xrun messages from logs and processing', width: 6, default: true, isVisible: (opt) => opt.enable_websocket === true },
    { type: 'checkbox', id: 'reset_variables', label: 'Reset variables', tooltip: 'Reset variables on init/connect', width: 6, default: true, isVisible: (opt) => opt.enable_websocket === true },
    { type: 'textinput', id: 'fbprefix', label: 'Feedback Prefix', default: '', width: 6, regex: '/^[\w\.\-_+\/\\\$ ]*$/', isVisible: (opt) => opt.enable_websocket === true },
    { type: 'textinput', id: 'fbsuffix', label: 'Feedback Suffix', default: '', width: 6, regex: '/^[\w\.\-_+\/\\\$ ]*$/', isVisible: (opt) => opt.enable_websocket === true },

    // OSC section
    { type: 'textinput', id: 'host', label: 'OSC Target Hostname or IP', width: 8, regex: Regex.HOSTNAME, required: false },
    { type: 'textinput', id: 'targetPort', label: 'OSC Target Port (UDP)', width: 4, regex: Regex.PORT, required: false },
    { type: 'checkbox', id: 'listen', label: 'Listen for OSC Feedback', width: 4, default: false },
    { type: 'textinput', id: 'feedbackPort', label: 'OSC Feedback Port (UDP)', width: 4, regex: Regex.PORT, isVisible: (options) => options.listen === true },
  ]
}
