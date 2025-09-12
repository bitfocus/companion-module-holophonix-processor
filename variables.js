export function setupVariables(instance) {
  instance.updateVariables = function updateVariables(callerId = null) {
    const variables = new Set()
    const defaultValues = {}

    this.subscriptions.forEach((subscription, subscriptionId) => {
      if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) return
      variables.add(subscription.variableName)
      if (callerId === null || callerId === subscriptionId) defaultValues[subscription.variableName] = ''
    })

    // Include any variables requested by OSC feedback subscriptions
    if (this.oscSubscriptions) {
      this.oscSubscriptions.forEach((subscription, subscriptionId) => {
        const name = subscription?.variableName
        if (!name || !name.match(/^[-a-zA-Z0-9_]+$/)) return
        variables.add(name)
        if (callerId === null || callerId === subscriptionId) defaultValues[name] = ''
      })
    }

    const variableDefinitions = []

    // WS (harmonized) only when WS enabled
    if (this.config?.enable_websocket) {
      variableDefinitions.push(
        { variableId: 'ws_latest_received_timestamp', name: 'Latest WebSocket message received timestamp' },
        { variableId: 'ws_latest_received_raw', name: 'Latest WebSocket message received (raw string)' },
        { variableId: 'ws_latest_received_json', name: 'Latest WebSocket message received (parsed JSON stringified)' },
        { variableId: 'ws_latest_received_filtered', name: 'Latest WebSocket message filtered by active subscriptions (JSON stringified)' },
        { variableId: 'ws_latest_request_uuid', name: 'Latest WebSocket request UUID' },
        { variableId: 'ws_latest_request_method', name: 'Latest WebSocket request method' },
        { variableId: 'ws_latest_request_payload', name: 'Latest WebSocket request payload (JSON stringified)' },
        { variableId: 'ws_latest_response_uuid', name: 'Latest WebSocket response UUID' },
        { variableId: 'ws_latest_response_method', name: 'Latest WebSocket response method' },
        { variableId: 'ws_latest_response_json', name: 'Latest WebSocket response (JSON stringified)' },
      )
    }

    // OSC (harmonized)
    variableDefinitions.push(
      { variableId: 'osc_latest_received_timestamp', name: 'Latest OSC message received timestamp' },
      { variableId: 'osc_latest_received_raw', name: 'Latest OSC message received' },
      { variableId: 'osc_latest_received_path', name: 'Latest OSC command received' },
      { variableId: 'osc_latest_received_client', name: 'Latest OSC message received client (UDP only)' },
      { variableId: 'osc_latest_received_port', name: 'Latest OSC message received port (UDP only)' },
      { variableId: 'osc_latest_received_args', name: 'Latest OSC arguments received array.' },
      { variableId: 'osc_latest_sent_timestamp', name: 'Latest OSC message sent timestamp' },
      { variableId: 'osc_latest_sent_raw', name: 'Latest OSC message sent' },
      { variableId: 'osc_latest_sent_path', name: 'Latest OSC command sent' },
      { variableId: 'osc_latest_sent_args', name: 'Latest OSC arguments sent array.' },
    )

    variables.forEach((variable) => {
      variableDefinitions.push({ name: variable, variableId: variable })
    })

    this.setVariableDefinitions(variableDefinitions)
    if (this.config.reset_variables) this.setVariableValues(defaultValues)
  }
}
