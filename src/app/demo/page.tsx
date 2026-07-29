'use client';

import IsoFloor, { type IsoMachine } from '@/components/iso/IsoFloor';

const DEMO_MACHINES: IsoMachine[] = [
  { id: 'demo-equity', kind: 'equity', label: 'Equity Desk 01', accent: '#00d26a' },
  { id: 'demo-rack', kind: 'rack', label: 'Treasury Desk 01', accent: '#05a357' },
  { id: 'demo-cooling', kind: 'cooling', label: 'Liquidity Desk', accent: '#3dd6a0' },
  { id: 'demo-packaging', kind: 'settlement', label: 'Structured Desk', accent: '#79e0b0' },
  { id: 'demo-equity-2', kind: 'equity', label: 'Equity Desk 02', accent: '#12b070' },
  { id: 'demo-rack-2', kind: 'rack', label: 'Treasury Desk 02', accent: '#0b7d47' },
];

export default function DemoPage() {
  return <IsoFloor demo machines={DEMO_MACHINES} storageKey="greenwood:demo-floor-layout:v2" />;
}

