// Static list of JSON paths expected in the WS Net response
// Built from docs/ws_net_response_example.json to avoid requiring docs at runtime

export const netPaths = [
  // Objects
  'Ethernet',
  'Ethernet.netInfo',

  // Leaf fields
  'Ethernet.netInfo.address',
  'Ethernet.netInfo.netmask',
  'Ethernet.netInfo.family',
  'Ethernet.netInfo.mac',
  'Ethernet.netInfo.internal',
  'Ethernet.netInfo.cidr',
  'Ethernet.mode',
  'Ethernet.active',
  'Ethernet.gateway',
  'Ethernet.errorDetected',
  'Ethernet.errorMessage',
  'Ethernet.type',
  'Ethernet.modelName',
]

export default netPaths
