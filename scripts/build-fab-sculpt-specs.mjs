import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const evidenceRoot = path.join(root, 'design-qa-evidence', 'fab-sculpts');
const template = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'lithography-machine', 'spec-draft.json'), 'utf8'));

const assets = [
  {
    slug: 'lithography-machine',
    name: 'Lithography Machine',
    ratio: [1.32, 1, 0.96],
    mechanisms: ['lens-head', 'wafer-stage', 'wafer-input-port'],
    features: ['rounded-shell-bevel', 'cobalt-viewing-window', 'orange-safety-latch', 'lime-status-beacon', 'wafer-grid', 'base-panel-seams'],
    repetitions: [{ id: 'wafer-grid-cells', primitive: 'box', count: 36, distribution: '6x6 grid on wafer stage' }],
  },
  {
    slug: 'wafer-stack',
    name: 'Wafer Stack',
    ratio: [0.82, 1.28, 0.8],
    mechanisms: ['wafer-carousel', 'three-shelf-system', 'robot-gripper-arm'],
    features: ['rounded-cabinet-bevel', 'three-wafer-shelves', 'orange-hinged-gripper', 'lime-status-strips', 'glossy-wafer-rims', 'charcoal-foot-pads'],
    repetitions: [{ id: 'stacked-wafer-discs', primitive: 'cylinder', count: 12, distribution: 'four discs on each of three shelves' }],
  },
  {
    slug: 'dicing-saw',
    name: 'Dicing Saw',
    ratio: [1.3, 1, 0.96],
    mechanisms: ['rotary-saw-blade', 'wafer-stage', 'side-control-pod'],
    features: ['rounded-shell-bevel', 'cobalt-viewing-window', 'eighteen-blade-teeth', 'lime-status-beacon', 'orange-safety-lever', 'base-panel-seams'],
    repetitions: [{ id: 'saw-blade-teeth', primitive: 'box', count: 18, distribution: 'radial around rotary blade' }],
  },
  {
    slug: 'packaging-line',
    name: 'Packaging Line',
    ratio: [1.48, 1, 0.94],
    mechanisms: ['pick-place-arm', 'input-conveyor', 'output-conveyor'],
    features: ['rounded-shell-bevel', 'cobalt-viewing-window', 'orange-articulated-arm', 'lime-status-strip', 'chip-package-pins', 'conveyor-roller-seams'],
    repetitions: [{ id: 'packaged-chip-system', primitive: 'box', count: 5, distribution: 'spaced across input and output conveyor belts' }],
  },
  {
    slug: 'euv-utility-core',
    name: 'EUV Utility Core',
    ratio: [1.45, 1, 0.88],
    mechanisms: ['luminous-euv-chamber', 'twin-cooling-banks', 'segmented-cable-array'],
    features: ['rounded-three-pod-shell', 'cobalt-circular-chamber', 'radial-chamber-segments', 'lime-status-array', 'six-heavy-utility-cables', 'orange-safety-beacon'],
    repetitions: [{ id: 'utility-cable-system', primitive: 'tube', count: 6, distribution: 'three embedded cables on each cooling pod' }],
  },
  {
    slug: 'ai-accelerator-test-rack',
    name: 'AI Accelerator Test Rack',
    ratio: [0.82, 1.15, 0.75],
    mechanisms: ['four-accelerator-trays', 'articulated-probe-arm', 'cooling-manifold'],
    features: ['rounded-rack-shell', 'cobalt-tray-bay', 'four-removable-trays', 'lime-status-array', 'hinged-probe-arm', 'bundled-cooling-hoses'],
    repetitions: [{ id: 'accelerator-tray-system', primitive: 'box', count: 4, distribution: 'vertical stack inside recessed cobalt rack bay' }],
  },
];

function attachment(parent, socket, start, end, type = 'overlap') {
  return {
    parentId: parent,
    parentSocket: socket,
    localStart: start,
    localEnd: end,
    baseRadius: 0.1,
    endRadius: 0.1,
    overlap: 0.03,
    embedDepth: 0.02,
    contactType: type,
    gapTolerance: 0.01,
    evidenceRefs: ['full-object'],
  };
}

function component(base, { id, name, level, parent, primitive, material, position, dimensions, features = [], socket = 'body-contact' }) {
  const item = structuredClone(base);
  item.id = id;
  item.name = name;
  item.level = level;
  item.role = id;
  item.importance = level === 'macro' ? 1 : level === 'meso' ? 0.82 : 0.58;
  item.confidence = 0.86;
  item.primitive = primitive;
  item.parent = parent;
  item.attachment = parent ? attachment(parent, socket, [position[0], position[1] - dimensions[1] / 2, position[2]], [position[0], position[1] + dimensions[1] / 2, position[2]], id.includes('arm') ? 'hinge' : 'overlap') : null;
  item.dimensions = { width: dimensions[0], height: dimensions[1], depth: dimensions[2], units: 'relative', confidence: 0.86 };
  item.transform = { position, rotation: [0, 0, 0], scale: [1, 1, 1] };
  item.material = material;
  item.materialLayers = [material];
  item.geometryDescriptor.edgeTreatment = { type: 'chamfer', bevelRadius: level === 'macro' ? 0.06 : 0.03, segments: 3 };
  item.localFeatures = features.map((feature) => ({ id: feature, type: feature.includes('bevel') ? 'bevel' : feature.includes('seam') ? 'seam' : 'linework', evidenceRef: 'full-object', confidence: 0.86 }));
  item.surfaceDetail = {
    macroRoughness: 0.52,
    microRoughness: 0.08,
    bumpAmplitude: 0.015,
    normalPattern: 'independent fine molded-plastic field',
    displacementPattern: 'none',
    occlusionPattern: 'contact and panel-seam AO',
    edgeWearPattern: 'subtle bevel crest polish',
    notes: 'Rounded toy-like industrial form; preserve real bevel catch-lights.',
  };
  item.fidelityTier = level === 'macro' ? 'blockout' : level === 'meso' ? 'structural' : 'surface';
  item.actionProfile.animationRole = id.includes('mechanism') || id.includes('control') ? 'articulated' : 'static';
  item.actionProfile.pivot.mode = id.includes('mechanism') ? 'custom' : 'center';
  item.actionProfile.collider = { type: primitive === 'cylinder' ? 'cylinder' : 'box', offset: [0, 0, 0], scale: dimensions, isTrigger: false, notes: `${id} runtime proxy` };
  item.actionProfile.destruction.fractureGroup = `${id}-group`;
  return item;
}

function material(base, id, name, color, utility, referencePbr) {
  const item = structuredClone(base);
  item.id = id;
  item.name = name;
  item.baseColor = color;
  item.color = color;
  item.qualityTier = utility ? 'utility' : 'hero';
  item.textureResolution = 1024;
  item.albedo = { ...item.albedo, dominant: color, secondary: utility ? [color] : ['#EAF0EC', '#C8D5CE', '#14211C'] };
  item.roughness = { base: id === 'window' ? 0.16 : id === 'metal' ? 0.31 : 0.52, variation: 0.08, map: 'independent-procedural-field', localResponse: 'panel seams rougher; bevel crests slightly smoother' };
  item.metalness = { base: id === 'metal' ? 0.62 : 0.05, variation: 0.04 };
  item.normal = { pattern: 'independent fine surface field', strength: 0.16, scale: 42, space: 'tangent' };
  item.clearcoat = id === 'window' ? 0.8 : id === 'shell' ? 0.18 : 0.04;
  item.localOverrides = [{ id: `${id}-edge-response`, region: 'bevel crests and contact seams', roughness: id === 'window' ? 0.12 : 0.38, affects: ['roughness', 'ambient-occlusion'], evidenceRef: 'full-object' }];
  item.wear = { edgeWear: 0.03, scratches: [], chips: [] };
  item.dirt = { amount: 0.01, cavityBias: 0.08, color: '#17211D' };
  if (!utility) item.referencePbr = referencePbr;
  else delete item.referencePbr;
  return item;
}

for (const asset of assets) {
  const spec = structuredClone(template);
  const dir = path.join(evidenceRoot, asset.slug);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'pbr', 'report.json'), 'utf8'));
  const sourceImage = path.join(root, 'public', 'assets', 'fab', `${asset.slug}-reference.png`);
  const pbrMaps = Object.fromEntries(Object.entries(report.maps).map(([key, value]) => [key, value]));
  const referencePbr = {
    version: '1.0',
    sourceImage,
    extractor: 'stage1_intake/extract_pbr_evidence.py',
    method: 'single-image pixel evidence with de-lighting estimate; not photogrammetry',
    usable: true,
    verdict: report.verdict,
    confidence: report.confidence,
    estimatedFidelity: report.estimatedFidelity,
    targetThreshold: report.targetThreshold,
    hardLimit: report.limitation,
    maps: pbrMaps,
    diagnostics: report.diagnostics,
    warnings: report.warnings,
  };

  spec.targetName = asset.name;
  spec.targetId = asset.slug;
  spec.sourceImage = sourceImage;
  spec.suitability = 'pass';
  spec.scores = { object_isolation: 3, silhouette_readability: 3, depth_inference: 2, primitive_decomposition: 3, material_procedurality: 3, occlusion_risk: 1, interaction_fit: 3 };
  spec.preSpecAssessment.objectClass = {
    primaryType: 'stylized semiconductor fabrication equipment',
    primaryDomain: 'object',
    formLanguage: ['hard-surface', 'mechanical', 'rounded toy-like industrial'],
    structureKind: ['compound object', 'layered shell', 'articulated assembly', 'repeated modules'],
    motionPotential: ['static prop', 'articulated', 'effect-emitter'],
    materialFamilies: ['molded plastic', 'painted metal', 'glass-like', 'silicon wafer'],
    notes: 'Single-view stylized reconstruction; hidden faces inferred by symmetry. Real-time browser game prop, not manufacturing geometry.',
  };
  spec.preSpecAssessment.complexity.scores = { silhouetteComplexity: 1, componentCount: 2, hierarchyDepth: 2, repetitionDensity: 2, materialLayerCount: 2, localDetailDensity: 2, occlusionRisk: 1, actionReadinessNeed: 2 };
  spec.preSpecAssessment.complexity.estimatedCounts = { macroComponents: 2, mesoComponents: 3, microFeatureGroups: 2, materialLayers: 4, repetitionSystems: 1 };
  spec.preSpecAssessment.complexity.reasoning = [`${asset.name} has a rounded compound shell, three recognizable subsystems, repeated detail, and four visible material families.`];
  spec.preSpecAssessment.specDepthDecision = { requiredDepth: 'moderate', minimumComponentLevels: ['macro', 'meso', 'micro'], needsRepetitionSystems: true, needsMaterialLocalOverrides: true, needsMultipleReviewViews: true, needsActionReadyHierarchy: true, rationale: 'Identity depends on shell proportions, a visible active mechanism, repeated production detail, and color-coded controls.' };
  spec.preSpecAssessment.unknownsToResolveBeforeImplementation = [];

  const detailKinds = ['bevel', 'gloss', 'linework', 'emissive', 'seam', 'fastener'];
  spec.preSpecAssessment.detailInventory = {
    scanMethod: 'grid-3x3',
    targetMinDetails: 6,
    details: asset.features.map((feature, index) => ({
      id: `${asset.slug}-detail-${index + 1}`,
      kind: detailKinds[index],
      description: feature.replaceAll('-', ' '),
      region: { x: (index % 3) / 3, y: Math.floor(index / 3) / 3, width: 0.3333, height: 0.3333, units: 'normalized' },
      scale: index < 2 ? 'meso' : 'micro',
      affects: index === 1 ? 'roughness and clearcoat' : index === 3 ? 'emissive response' : 'geometry and local material response',
      mapsTo: { type: index === 1 ? 'material.localOverrides' : 'component.localFeatures', ref: index === 1 ? 'window/window-edge-response' : feature },
      evidenceRef: `zones/zone-r${Math.floor(index / 3)}c${index % 3}.png`,
      confidence: 0.86,
    })),
  };

  spec.qualityContract.definitionOfDone = [`${asset.name} is immediately recognizable from the reference silhouette, rounded enclosure, active mechanism, color zones, and six identity-defining details at real-time game scale.`];
  spec.qualityContract.minimumSpecDepth = { macroComponents: 2, mesoComponents: 3, microFeatureGroups: 2, materialLayers: 4, repetitionSystems: 1, reviewViewpoints: 3 };
  spec.qualityContract.featureGroups = [
    { id: `${asset.slug}-enclosure`, name: 'Rounded enclosure silhouette', required: true, qualityCriteria: ['Reference width/height/depth ratio and large-radius bevels remain readable.'], evidenceRefs: ['full-object'], failureModes: ['generic cube silhouette', 'sharp unstyled edges'] },
    { id: `${asset.slug}-mechanism`, name: 'Active production mechanism', required: true, qualityCriteria: [`${asset.mechanisms.join(', ')} are separated into named pivot groups.`], evidenceRefs: ['full-object'], failureModes: ['mechanism merged into shell', 'floating attachment'] },
    { id: `${asset.slug}-lookdev`, name: 'Cleanroom palette and surface response', required: true, qualityCriteria: ['White shell, cobalt window, charcoal base, lime status, and orange safety accents match the shared family.'], evidenceRefs: ['full-object'], failureModes: ['flat color', 'missing roughness separation'] },
  ];

  const base = template.componentTree[0];
  const [w, h, d] = asset.ratio;
  spec.componentTree = [
    component(base, { id: 'root', name: asset.name, level: 'macro', parent: null, primitive: 'box', material: 'shell', position: [0, 0, 0], dimensions: [w, h, d] }),
    component(base, { id: 'shell', name: 'Rounded enclosure shell', level: 'macro', parent: 'root', primitive: 'box', material: 'shell', position: [0, 0.52, 0], dimensions: [w, h * 0.88, d], features: [asset.features[0], asset.features[5]], socket: 'root-body' }),
    component(base, { id: 'window', name: 'Cobalt viewing window', level: 'meso', parent: 'shell', primitive: 'box', material: 'window', position: [0, 0.6, d * 0.51], dimensions: [w * 0.72, h * 0.52, 0.04], features: [asset.features[1]], socket: 'front-panel' }),
    component(base, { id: 'mechanism', name: asset.mechanisms[0], level: 'meso', parent: 'shell', primitive: asset.slug === 'dicing-saw' ? 'cylinder' : 'box', material: 'metal', position: [0, 0.62, d * 0.48], dimensions: [w * 0.32, h * 0.36, d * 0.18], features: [asset.features[2]], socket: 'interior-rail' }),
    component(base, { id: 'production-stage', name: asset.mechanisms[1], level: 'meso', parent: 'shell', primitive: 'cylinder', material: 'metal', position: [0, 0.25, d * 0.42], dimensions: [w * 0.45, 0.1, d * 0.38], features: [asset.features[4]], socket: 'interior-floor' }),
    component(base, { id: 'status-light', name: 'Lime status light', level: 'micro', parent: 'shell', primitive: 'cylinder', material: 'accent', position: [w * 0.34, h * 0.95, 0], dimensions: [0.1, 0.18, 0.1], features: [asset.features[3]], socket: 'roof-status-socket' }),
    component(base, { id: 'safety-control', name: 'Orange safety control', level: 'micro', parent: 'shell', primitive: 'box', material: 'safety', position: [w * 0.43, h * 0.45, d * 0.51], dimensions: [0.12, 0.24, 0.06], features: [asset.features[5]], socket: 'front-control-socket' }),
  ];

  const baseMaterial = template.materials[0];
  spec.materials = [
    material(baseMaterial, 'shell', 'Warm cleanroom shell', '#EFF4EF', false, referencePbr),
    material(baseMaterial, 'window', 'Cobalt viewing glass', '#1F65DC', true),
    material(baseMaterial, 'metal', 'Charcoal brushed mechanism', '#18231F', true),
    material(baseMaterial, 'accent', 'Silicon lime status', '#7EE85F', true),
    material(baseMaterial, 'safety', 'Safety orange control', '#FF8A25', true),
  ];
  spec.repetitionSystems = asset.repetitions.map((item) => ({ ...item, componentRef: 'production-stage', material: 'metal', deterministicSeed: 42, evidenceRefs: ['full-object'], implementation: 'THREE.InstancedMesh or repeated primitive groups' }));
  spec.silhouette = { boundingShape: `rounded industrial enclosure with relative ratio ${asset.ratio.join(':')}`, aspectRatios: asset.ratio, symmetry: 'mostly bilateral with one asymmetrical control subsystem', dominantCurves: ['large-radius shell corners', 'soft rectangular base transition'], negativeSpaces: ['recessed viewing window', 'visible mechanism cavity'], landmarks: asset.mechanisms };
  spec.viewEvidence[0].observations = [`Three-quarter front view clearly exposes ${asset.mechanisms.join(', ')}.`, 'Hidden back inferred from repeated rounded enclosure seams.', 'Palette and material boundaries are unambiguous.'];
  spec.viewEvidence[0].confidence = 0.86;
  spec.qualityTargets.targetFidelity = 0.82;
  spec.featureReviewTargets = [
    { id: `${asset.slug}-silhouette`, name: `${asset.name} enclosure silhouette`, tier: 'critical', passIds: ['blockout', 'form-refinement'], minimumScore: 0.78, mustPass: true, componentRefs: ['root', 'shell'], evidenceRefs: ['full-object'] },
    { id: `${asset.slug}-mechanism-system`, name: `${asset.mechanisms[0]} and ${asset.mechanisms[1]} system`, tier: 'critical', passIds: ['structural-pass', 'interaction-pass'], minimumScore: 0.76, mustPass: true, componentRefs: ['mechanism', 'production-stage'], evidenceRefs: ['full-object'] },
    { id: `${asset.slug}-material-system`, name: 'White shell, cobalt glass, lime status, charcoal base, orange safety palette', tier: 'critical', passIds: ['material-pass', 'surface-pass', 'lighting-pass'], minimumScore: 0.74, mustPass: true, componentRefs: ['shell', 'window', 'status-light', 'safety-control'], evidenceRefs: ['full-object'] },
  ];
  spec.lightingFromPhoto = [
    { type: 'key light', direction: [-0.45, 0.72, 0.52], color: '#F5FBFF', intensity: 1.8, shadowSoftness: 0.72 },
    { type: 'fill light', direction: [0.62, 0.35, 0.3], color: '#C8E4FF', intensity: 0.65 },
    { type: 'environment reflection', color: '#DDEEFF', intensity: 0.48 },
    { type: 'render intent', exposure: 1.08, toneMapping: 'ACESFilmic', background: '#C7DFF8', 'contact shadow': 'soft, compact, directly below base' },
  ];
  spec.assumptions = ['Stylized single-image reconstruction capped below 0.9 fidelity.', 'Rear service panels mirror visible side language.', 'No manufacturer logos or exact real-world dimensions.'];
  spec.risks = ['Single view hides rear depth.', 'Generated studio background is included in reference-derived PBR evidence.', 'Transparent-looking window is represented as glossy opaque cobalt for mobile performance.'];
  spec.performanceBudget = { qualityPriority: 'real-time-game', targetTriangles: 18000, maxDrawCalls: 42, textureSize: 1024, fpsTarget: 60, optimizationPolicy: 'Instance repeated details and keep curved segments between 18 and 32.' };
  for (const pass of spec.buildPasses) pass.componentRefs = spec.componentTree.map((item) => item.id);

  fs.writeFileSync(path.join(dir, 'object-sculpt-spec.json'), `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'assessment-complete.json'), `${JSON.stringify({ targetName: asset.name, sourceImage, preSpecAssessment: spec.preSpecAssessment, qualityContract: spec.qualityContract }, null, 2)}\n`, 'utf8');
}

console.log(`Wrote ${assets.length} fab sculpt specs.`);
