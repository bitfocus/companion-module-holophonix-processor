// Static list of JSON paths expected in the WS Project response
// Built from docs/ws_project_response_example.json to avoid requiring docs at runtime

export const projectPaths = [
  // Top-level
  'manifest',
  'presetList',
  'hrtfList',
  'venueModelList',
  'systemFullPath',

  // Manifest basics
  'manifest.widthMeters',
  'manifest.center.x',
  'manifest.center.y',
  'manifest.center.z',
  'manifest.position.x',
  'manifest.position.y',
  'manifest.position.z',
  'manifest.rotation.x',
  'manifest.rotation.y',
  'manifest.rotation.z',
  'manifest.wireframe',
  'manifest.scale',
  'manifest.defaultPreset',
  'manifest.externalOscIp',
  'manifest.externalOscInputPort',
  'manifest.guiVersion',
  'manifest.performanceMode',
  'manifest.admScale',
  'manifest.created',
  'manifest.model3DFileName',
  'manifest.lastMixingConsoleIP',

  // First preset (when present)
  'presetList.0.type',
  'presetList.0.name',
  'presetList.0.nameWithExtension',
  'presetList.0.extension',
  'presetList.0.modified',
  'presetList.0.created',
  'presetList.0.systemFullPath',
  'presetList.0.url',
  'presetList.0.lock',
  'presetList.0.outputs',

  // First HRTF
  'hrtfList.0.type',
  'hrtfList.0.name',
  'hrtfList.0.nameWithExtension',
  'hrtfList.0.extension',
  'hrtfList.0.modified',
  'hrtfList.0.created',
  'hrtfList.0.systemFullPath',
  'hrtfList.0.url',
  'hrtfList.0.hrtfSamplingRate',

  // Venue model (first)
  'venueModelList.0.type',
  'venueModelList.0.name',
  'venueModelList.0.nameWithExtension',
  'venueModelList.0.extension',
  'venueModelList.0.modified',
  'venueModelList.0.created',
  'venueModelList.0.systemFullPath',
  'venueModelList.0.url',
]

export default projectPaths
