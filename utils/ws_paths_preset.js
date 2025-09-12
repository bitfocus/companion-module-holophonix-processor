// Static list of JSON paths expected in the WS Preset response
// Curated from docs/ws_preset_response_example.json to avoid requiring docs at runtime

const basicInfo = [
  'usePresetStore.name',
  'usePresetStore.audioEngineVersion',
  'usePresetStore.guiVersion',
  'usePresetStore.preset.creation',
  'usePresetStore.preset.modification',
  'usePresetStore.preset.lock',
  'usePresetStore.presetHasBeenModified',
  'usePresetStore.isPresetSaved',
]

const deviceInfo = [
  'useSoundDeviceStore.samplerate.current',
  'useSoundDeviceStore.buffersize.current',
  'useSoundDeviceStore.usurp',
]

const mclInfo = [
  'useMclStore.enable',
  'useMclStore.faderMode',
  'useMclStore.nbChannels',
]

const layerInfo = [
  'useLayerStore.uuids',
  'useLayerStore.entities.model3D.visible',
  'useLayerStore.entities.model3D.opacity',
  'useLayerStore.entities.gridPoints.visible',
]

const masterElement = [
  'useSoundElementStore.entities.master.ae.name',
  'useSoundElementStore.entities.master.ae.visible',
  'useSoundElementStore.entities.master.ae.trim',
  'useSoundElementStore.entities.master.ae.gain.value',
  'useSoundElementStore.entities.master.ae.mute',
  'useSoundElementStore.entities.master.ae.dynamics.compressor.threshold',
]

// Placeholder-based generic paths (to be edited by user when selecting)
// Conventions:
//  - {elementId}: replace with an entity id, e.g. 'master', 'reverb4', ...
//  - {chanIndex}: replace with a 1-based channel index, e.g. '1', '2', ...
//  - {filterIndex}: replace with an EQ filter index, e.g. '1'..'8'
//  - {layerId}: replace with a layer name, e.g. 'model3D', 'gridPoints'
//  - {relationId}: replace with a relation numeric id in MCL currentRelations

const placeholders = [
  // Sound elements (entity-level)
  'useSoundElementStore.entities.{elementId}.ae.name',
  'useSoundElementStore.entities.{elementId}.ae.visible',
  'useSoundElementStore.entities.{elementId}.ae.gain.value',
  'useSoundElementStore.entities.{elementId}.ae.mute',
  'useSoundElementStore.entities.{elementId}.ae.trim',
  'useSoundElementStore.entities.{elementId}.ae.dynamics.compressor.threshold',
  'useSoundElementStore.entities.{elementId}.levels.input.value',
  'useSoundElementStore.entities.{elementId}.levels.output.value',

  // Sound elements (per-channel examples)
  'useSoundElementStore.entities.{elementId}.channel.{chanIndex}.equalizer.gain',
  'useSoundElementStore.entities.{elementId}.channel.{chanIndex}.equalizer.filter.{filterIndex}.active',
  'useSoundElementStore.entities.{elementId}.channel.{chanIndex}.delay',

  // MCL relations
  'useMclStore.currentRelations.{relationId}.elementId',
  'useMclStore.currentRelations.{relationId}.active',
  'useMclStore.currentRelations.{relationId}.syncParams',

  // Layers
  'useLayerStore.entities.{layerId}.visible',
  'useLayerStore.entities.{layerId}.opacity',

  // Test generator
  'useTestGenStore.dac.test.active',
  'useTestGenStore.dac.test.gain',
  'useTestGenStore.dac.test.channel',
  'useTestGenStore.adc.test.active',
  'useTestGenStore.adc.test.gain',
  'useTestGenStore.adc.test.channel',

  // Motion
  'useMotionStore.masterActive',
  'useMotionStore.masterSpeed',
]

export const presetPaths = [
  // Top-level sections
  'usePresetStore',
  'useSoundDeviceStore',
  'useMclStore',
  'useLayerStore',
  'useSoundElementStore',
  // Details
  ...basicInfo,
  ...deviceInfo,
  ...mclInfo,
  ...layerInfo,
  ...masterElement,
  // Generic placeholders
  ...placeholders,
]

export default presetPaths
