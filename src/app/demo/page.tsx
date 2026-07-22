'use client';

import FabSandbox, { type SandboxMachine } from '@/components/game/FabSandbox';

const DEMO_MACHINES: SandboxMachine[] = [
  { id: 'demo-euv', kind: 'euv', label: 'EUV Utility Core', accent: '#b7ff4a' },
  { id: 'demo-rack', kind: 'rack', label: 'AI Accelerator Rack', accent: '#45e6ff' },
  { id: 'demo-cooling', kind: 'cooling', label: 'Liquid Cooling Array', accent: '#5b7dff' },
  { id: 'demo-packaging', kind: 'packaging', label: 'Chiplet Packaging Line', accent: '#ff9a35' },
];

export default function DemoPage() {
  return <FabSandbox demo machines={DEMO_MACHINES} storageKey="gpu:demo-floor-layout:v1" />;
}

