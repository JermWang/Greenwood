'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowLeft, ArrowsOutCardinal, Cube, PersonSimpleWalk, Trash } from '@phosphor-icons/react';
import { AcceleratorTestRack, EUVUtilityCore } from '@/components/three/Compound';
import WarehouseEnvironment from '@/components/three/WarehouseEnvironment';
import PostFX from '@/components/three/PostFX';
import { api, type FloorBonus } from '@/lib/api-client';

export type MachineKind = 'euv' | 'rack' | 'cooling' | 'packaging';

export interface SandboxMachine {
  id: string;
  kind: MachineKind;
  label: string;
  accent?: string;
}

interface PlacedMachine extends SandboxMachine {
  x: number;
  z: number;
  rotation: number;
}

const VALID_KINDS = new Set<MachineKind>(['euv', 'rack', 'cooling', 'packaging']);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const DEMO_POSITIONS = [[-6, -7], [5, -8], [-5, 2], [5, 3]] as const;

function createDemoLayout(machines: SandboxMachine[]): PlacedMachine[] {
  return machines.map((machine, index) => ({
    ...machine,
    x: DEMO_POSITIONS[index % DEMO_POSITIONS.length][0],
    z: DEMO_POSITIONS[index % DEMO_POSITIONS.length][1],
    rotation: index % 2 ? Math.PI : 0,
  }));
}

function loadLayout(storageKey: string, machines: SandboxMachine[]): PlacedMachine[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const owned = new Map(machines.map((machine) => [machine.id, machine]));
    return parsed.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const value = candidate as Partial<PlacedMachine>;
      const item = typeof value.id === 'string' ? owned.get(value.id) : null;
      if (!item || !VALID_KINDS.has(value.kind as MachineKind)) return [];
      if (![value.x, value.z, value.rotation].every((part) => typeof part === 'number' && Number.isFinite(part))) return [];
      return [{ ...item, x: clamp(value.x!, -13, 13), z: clamp(value.z!, -20, 13), rotation: value.rotation! }];
    });
  } catch {
    return [];
  }
}

function Player({ position, keys }: { position: MutableRefObject<THREE.Vector3>; keys: MutableRefObject<Set<string>> }) {
  const ref = useRef<THREE.Group>(null);
  const armLeft = useRef<THREE.Group>(null);
  const armRight = useRef<THREE.Group>(null);
  const legLeft = useRef<THREE.Group>(null);
  const legRight = useRef<THREE.Group>(null);
  // Gait state lives outside React: phase is where in the stride cycle the limbs
  // are, stride/air are 0..1 blend weights eased every frame so starting, stopping
  // and landing settle smoothly instead of snapping between poses.
  const gait = useRef({ phase: 0, stride: 0, air: 0, jumpY: 0, jumpVelocity: 0, yaw: 0 });
  const { camera } = useThree();
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    let dx = 0;
    let dz = 0;
    if (keys.current.has('w') || keys.current.has('arrowup')) dz -= 1;
    if (keys.current.has('s') || keys.current.has('arrowdown')) dz += 1;
    if (keys.current.has('a') || keys.current.has('arrowleft')) dx -= 1;
    if (keys.current.has('d') || keys.current.has('arrowright')) dx += 1;
    const gaitState = gait.current;
    const grounded = gaitState.jumpY <= 0.0001;
    let speed = 0;
    if (dx || dz) {
      const length = Math.hypot(dx, dz);
      dx /= length;
      dz /= length;
      speed = keys.current.has('shift') ? 7.2 : 4.7;
      position.current.x = clamp(position.current.x + dx * speed * delta, -13.4, 13.4);
      position.current.z = clamp(position.current.z + dz * speed * delta, -21, 14);
      gaitState.yaw = Math.atan2(dx, dz);
    }

    if (grounded && keys.current.has(' ')) gaitState.jumpVelocity = 5.3;
    gaitState.jumpY += gaitState.jumpVelocity * delta;
    if (gaitState.jumpY > 0) {
      gaitState.jumpVelocity -= 14 * delta;
    } else {
      gaitState.jumpY = 0;
      if (gaitState.jumpVelocity < 0) gaitState.jumpVelocity = 0;
    }

    // Stride frequency tracks ground speed, so running pumps the limbs faster
    // rather than lengthening an invisible step.
    if (speed && grounded) gaitState.phase += delta * speed * 2.1;
    gaitState.stride += ((speed && grounded ? 1 : 0) - gaitState.stride) * (1 - Math.exp(-10 * delta));
    gaitState.air += ((grounded ? 0 : 1) - gaitState.air) * (1 - Math.exp(-9 * delta));

    const swing = Math.sin(gaitState.phase) * 0.62 * gaitState.stride;
    const tuck = gaitState.air;
    armLeft.current?.rotation.set(swing - 0.25 * tuck, 0, -0.1 - 0.5 * tuck);
    armRight.current?.rotation.set(-swing - 0.25 * tuck, 0, 0.1 + 0.5 * tuck);
    legLeft.current?.rotation.set(-swing * 0.85 + 0.32 * tuck, 0, 0);
    legRight.current?.rotation.set(swing * 0.85 + 0.18 * tuck, 0, 0);

    if (ref.current) {
      // Turn along the shortest arc; a raw copy of the target yaw makes a
      // reversal spin the long way round through a full turn.
      const turn = THREE.MathUtils.euclideanModulo(gaitState.yaw - ref.current.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      ref.current.rotation.y += turn * (1 - Math.exp(-11 * delta));
      const bob = Math.abs(Math.sin(gaitState.phase)) * 0.05 * gaitState.stride * (1 - tuck);
      ref.current.position.set(position.current.x, 0.42 + gaitState.jumpY + bob, position.current.z);
    }

    // The camera tracks the ground position, not the jump arc — chasing the hop
    // vertically makes the whole room lurch.
    desiredCamera.set(position.current.x, 5.2, position.current.z + 8.2);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-5 * delta));
    lookTarget.set(position.current.x, 1.2, position.current.z - 1.8);
    camera.lookAt(lookTarget);
  });

  return (
    <group ref={ref} position={[0, 0.42, 12]}>
      <mesh position={[0, 1.45, 0]} castShadow><sphereGeometry args={[0.34, 18, 14]} /><meshStandardMaterial color="#f4f7f3" roughness={0.55} /></mesh>
      <RoundedBox args={[0.72, 1.2, 0.48]} radius={0.2} smoothness={3} position={[0, 0.66, 0]} castShadow><meshStandardMaterial color="#195fd1" roughness={0.42} /></RoundedBox>
      {/* Limbs hang from pivot groups at the shoulder and hip, so swinging them
          rotates about the joint. Rotating the box itself pivots at its middle,
          which drove the arm tops through the torso. */}
      {([[-1, armLeft], [1, armRight]] as const).map(([side, joint]) => (
        <group key={`arm-${side}`} ref={joint} position={[side * 0.5, 1.14, 0]}>
          <RoundedBox args={[0.18, 0.84, 0.18]} radius={0.08} smoothness={2} position={[0, -0.4, 0]} castShadow><meshStandardMaterial color="#e9f0ed" /></RoundedBox>
        </group>
      ))}
      {([[-1, legLeft], [1, legRight]] as const).map(([side, joint]) => (
        <group key={`leg-${side}`} ref={joint} position={[side * 0.2, 0.3, 0]}>
          <RoundedBox args={[0.22, 0.72, 0.24]} radius={0.08} smoothness={2} position={[0, -0.36, 0]} castShadow><meshStandardMaterial color="#202a36" /></RoundedBox>
        </group>
      ))}
      <mesh position={[0, 0.1, -0.27]}><boxGeometry args={[0.46, 0.12, 0.06]} /><meshBasicMaterial color="#b7ff4a" toneMapped={false} /></mesh>
    </group>
  );
}

function BuildCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 7.7, 18);
    camera.lookAt(0, 1.1, -4);
  }, [camera]);
  return <OrbitControls makeDefault target={[0, 1.1, -4]} enableDamping dampingFactor={0.08} minDistance={9} maxDistance={29} minPolarAngle={0.42} maxPolarAngle={1.28} />;
}

function CompactMachine({ kind, accent = '#62e8ff' }: { kind: 'cooling' | 'packaging'; accent?: string }) {
  if (kind === 'cooling') {
    return (
      <group>
        <RoundedBox args={[2.8, 2.4, 2]} radius={0.28} smoothness={3} position={[0, 1.2, 0]} castShadow><meshStandardMaterial color="#edf2f1" roughness={0.44} /></RoundedBox>
        {[-0.72, 0, 0.72].map((x) => <mesh key={x} position={[x, 1.3, 1.03]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.32, 0.32, 0.08, 20]} /><meshStandardMaterial color="#1d3145" metalness={0.45} /></mesh>)}
        <mesh position={[0, 2, 1.05]}><boxGeometry args={[1.5, 0.12, 0.05]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
      </group>
    );
  }
  return (
    <group>
      <RoundedBox args={[3.5, 1.8, 2.2]} radius={0.25} smoothness={3} position={[0, 0.9, 0]} castShadow><meshStandardMaterial color="#f0f3f0" roughness={0.5} /></RoundedBox>
      <RoundedBox args={[2.7, 0.72, 0.08]} radius={0.12} smoothness={2} position={[0, 1.12, 1.13]}><meshStandardMaterial color="#123b84" /></RoundedBox>
      {[-0.78, 0, 0.78].map((x) => <mesh key={x} position={[x, 1.12, 1.19]}><boxGeometry args={[0.38, 0.18, 0.04]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>)}
      <RoundedBox args={[4.5, 0.24, 1.05]} radius={0.1} smoothness={2} position={[0, 0.2, 0]}><meshStandardMaterial color="#293442" metalness={0.42} /></RoundedBox>
    </group>
  );
}

function MachineModel({ machine, selected, onSelect }: { machine: PlacedMachine; selected: boolean; onSelect: () => void }) {
  const scale = machine.kind === 'euv' ? 0.43 : machine.kind === 'rack' ? 0.52 : 0.78;
  return (
    <group
      position={[machine.x, 0, machine.z]}
      rotation={[0, machine.rotation, 0]}
      scale={scale}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}
    >
      {machine.kind === 'euv' ? <EUVUtilityCore review /> : machine.kind === 'rack' ? <AcceleratorTestRack review /> : <CompactMachine kind={machine.kind} accent={machine.accent} />}
      {selected && (
        <group name="physical-selection-fixture">
          {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
            <group key={`${x}-${z}`} position={[x * 3.25, 0.4, z * 1.8]}>
              <RoundedBox args={[0.18, 0.78, 0.18]} radius={0.05} smoothness={2}><meshBasicMaterial color="#b7ff4a" toneMapped={false} /></RoundedBox>
              <pointLight color="#b7ff4a" intensity={0.7} distance={2.6} decay={2} position={[0, 0.42, 0]} />
            </group>
          )))}
          <RoundedBox args={[2.2, 0.12, 0.18]} radius={0.05} smoothness={2} position={[0, 3.75, 0]}><meshBasicMaterial color="#b7ff4a" toneMapped={false} /></RoundedBox>
        </group>
      )}
    </group>
  );
}

function FabWorld({
  mode,
  keys,
  playerPosition,
  placed,
  selectedId,
  onSelect,
  onFloor,
}: {
  mode: 'walk' | 'build';
  keys: MutableRefObject<Set<string>>;
  playerPosition: MutableRefObject<THREE.Vector3>;
  placed: PlacedMachine[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFloor: (point: THREE.Vector3) => void;
}) {
  return (
    <>
      <WarehouseEnvironment onFloor={onFloor} />
      {placed.map((machine) => <MachineModel key={machine.id} machine={machine} selected={machine.id === selectedId} onSelect={() => onSelect(machine.id)} />)}
      {mode === 'walk' ? <Player position={playerPosition} keys={keys} /> : <BuildCamera />}
      {/* An interior wants a tighter AO radius than an open scene: the gaps that
          need darkening here are equipment-to-floor, not building-to-ground. */}
      <PostFX aoRadius={1.1} aoIntensity={2.3} />
    </>
  );
}

export default function FabSandbox({ machines, storageKey, demo = false, wallet }: { machines: SandboxMachine[]; storageKey: string; demo?: boolean; wallet?: string }) {
  const [mode, setMode] = useState<'walk' | 'build'>('walk');
  const [placed, setPlaced] = useState<PlacedMachine[]>(() => demo ? createDemoLayout(machines) : []);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(machines[0]?.id ?? null);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [bonus, setBonus] = useState<FloorBonus | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const keys = useRef(new Set<string>());
  const playerPosition = useRef(new THREE.Vector3(0, 0.42, 12));

  // Identity of the owned set, not the array. The parent rebuilds `machines`
  // whenever inventory refreshes, and depending on the array itself would
  // re-run the load — overwriting placements the player just made.
  const machineKey = useMemo(() => machines.map((machine) => machine.id).join(','), [machines]);
  const machinesRef = useRef(machines);
  machinesRef.current = machines;

  useEffect(() => {
    // Demo has no wallet, so it stays on localStorage: there is nothing to key
    // server state to, and the point of the demo is that it needs no account.
    if (!wallet) {
      const restored = loadLayout(storageKey, machinesRef.current);
      setPlaced(restored.length > 0 || !demo ? restored : createDemoLayout(machinesRef.current));
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void api.floor(wallet)
      .then((result) => {
        if (cancelled) return;
        const owned = new Map(machinesRef.current.map((machine) => [machine.id, machine]));
        setPlaced(
          result.layout.flatMap((entry) => {
            const machine = owned.get(entry.id);
            return machine ? [{ ...machine, x: entry.x, z: entry.z, rotation: entry.rotation }] : [];
          })
        );
        setBonus(result.bonus);
      })
      .catch(() => {
        /* An unreachable floor is an empty floor, not a broken page. */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => { cancelled = true; };
  }, [demo, machineKey, storageKey, wallet]);

  useEffect(() => {
    if (!hydrated) return;
    if (!wallet) {
      window.localStorage.setItem(storageKey, JSON.stringify(placed));
      return;
    }
    // Debounced: dragging a machine across the floor produces a placement per
    // click, and each one would otherwise be a round trip that rescores the
    // whole network denominator.
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      void api.saveFloor(wallet, placed.map(({ id, x, z, rotation }) => ({ id, x, z, rotation })))
        .then((result) => {
          setBonus(result.bonus);
          setSaveState('idle');
          // The server drops anything it will not accept, so render what it
          // actually stored rather than what we asked it to store.
          const owned = new Map(machinesRef.current.map((machine) => [machine.id, machine]));
          setPlaced((current) =>
            result.layout.length === current.length
              ? current
              : result.layout.flatMap((entry) => {
                  const machine = owned.get(entry.id);
                  return machine ? [{ ...machine, x: entry.x, z: entry.z, rotation: entry.rotation }] : [];
                })
          );
        })
        .catch(() => setSaveState('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, placed, storageKey, wallet]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      // Space is the jump key; preventDefault also stops it scrolling the page.
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(key)) {
        event.preventDefault();
        keys.current.add(key);
      }
      if (key === 'b') setMode((current) => current === 'walk' ? 'build' : 'walk');
      if (key === 'r' && selectedPlacedId) setPlaced((current) => current.map((item) => item.id === selectedPlacedId ? { ...item, rotation: item.rotation + Math.PI / 2 } : item));
      if ((key === 'delete' || key === 'backspace') && selectedPlacedId) {
        setPlaced((current) => current.filter((item) => item.id !== selectedPlacedId));
        setSelectedPlacedId(null);
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [selectedPlacedId]);

  const placedIds = useMemo(() => new Set(placed.map((item) => item.id)), [placed]);
  const place = useCallback((point: THREE.Vector3) => {
    if (mode !== 'build' || !selectedCatalogId) return;
    const machine = machines.find((item) => item.id === selectedCatalogId);
    if (!machine) return;
    const x = clamp(Math.round(point.x), -12, 12);
    const z = clamp(Math.round(point.z), -20, 12);
    setPlaced((current) => current.some((item) => item.id === machine.id)
      ? current.map((item) => item.id === machine.id ? { ...item, x, z } : item)
      : [...current, { ...machine, x, z, rotation: 0 }]);
    setSelectedPlacedId(machine.id);
  }, [machines, mode, selectedCatalogId]);

  const removeSelected = () => {
    if (!selectedPlacedId) return;
    setPlaced((current) => current.filter((item) => item.id !== selectedPlacedId));
    setSelectedPlacedId(null);
  };

  return (
    <main className="fab-sandbox">
      <Canvas shadows dpr={[1, 1.6]} camera={{ position: [0, 5.2, 20], fov: 48, near: 0.1, far: 120 }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <FabWorld mode={mode} keys={keys} playerPosition={playerPosition} placed={placed} selectedId={selectedPlacedId} onSelect={setSelectedPlacedId} onFloor={place} />
      </Canvas>

      <header className="fab-sandbox-top">
        <Link href={demo ? '/' : '/app'}><ArrowLeft size={17} /> {demo ? 'Title' : 'Dashboard'}</Link>
        <div><b>{demo ? 'DEMO COMPANY' : 'COMPANY FLOOR'}</b><span>{mode === 'walk' ? 'WALK MODE' : 'BUILD MODE'}</span></div>
        <button onClick={() => setMode((current) => current === 'walk' ? 'build' : 'walk')}>{mode === 'walk' ? <Cube size={17} /> : <PersonSimpleWalk size={18} />}{mode === 'walk' ? 'Build' : 'Walk'} <kbd>B</kbd></button>
      </header>

      <aside className={`fab-build-catalog ${mode === 'build' ? 'is-open' : ''}`}>
        <div className="fab-build-title"><span>OWNED EQUIPMENT</span><b>{placed.length}/{machines.length} placed</b></div>
        <div className="fab-build-items">
          {machines.map((machine) => (
            <button key={machine.id} className={selectedCatalogId === machine.id ? 'is-active' : ''} onClick={() => { setSelectedCatalogId(machine.id); setSelectedPlacedId(placedIds.has(machine.id) ? machine.id : null); }}>
              <span style={{ '--machine-accent': machine.accent ?? '#62e8ff' } as CSSProperties}><Cube size={16} weight="duotone" /></span>
              <b>{machine.label}</b><small>{placedIds.has(machine.id) ? 'Placed · click floor to move' : 'Ready to place'}</small>
            </button>
          ))}
        </div>
        <div className="fab-build-actions">
          <button onClick={() => selectedPlacedId && setPlaced((current) => current.map((item) => item.id === selectedPlacedId ? { ...item, rotation: item.rotation + Math.PI / 2 } : item))} disabled={!selectedPlacedId}><ArrowsOutCardinal size={15} /> Rotate <kbd>R</kbd></button>
          <button onClick={removeSelected} disabled={!selectedPlacedId}><Trash size={15} /> Store</button>
        </div>
      </aside>

      {wallet && (
        <aside className="fab-yield-panel">
          <div className="fab-yield-head">
            <span>Floor yield</span>
            <b className={!bonus || bonus.multiplier >= 1 ? 'is-up' : 'is-down'}>
              {bonus ? `${bonus.multiplier >= 1 ? '+' : ''}${((bonus.multiplier - 1) * 100).toFixed(1)}%` : '—'}
            </b>
          </div>
          <ul>
            {bonus && bonus.effects.length > 0 ? (
              bonus.effects.map((effect) => (
                <li key={effect.key} className={effect.delta < 0 ? 'is-down' : ''}>
                  <span>{effect.label}</span>
                  <b>{effect.delta >= 0 ? '+' : ''}{(effect.delta * 100).toFixed(1)}%</b>
                  <small>{effect.lines} line{effect.lines === 1 ? '' : 's'}</small>
                </li>
              ))
            ) : (
              <li className="is-empty">
                <span>Put cooling and packaging within reach of a production line, and keep lines off each other&rsquo;s airflow.</span>
              </li>
            )}
          </ul>
          <footer>
            {saveState === 'saving'
              ? 'Saving layout…'
              : saveState === 'error'
                ? 'Save failed — will retry on the next change'
                : 'Layout saved to your operator'}
          </footer>
        </aside>
      )}

      <div className="fab-sandbox-controls">
        {mode === 'walk' ? <><kbd>WASD</kbd><span>Walk</span><kbd>SHIFT</kbd><span>Run</span><kbd>SPACE</kbd><span>Jump</span><kbd>B</kbd><span>Build mode</span></> : <><span>Select equipment, then click the floor to place or move it</span><kbd>R</kbd><span>Rotate</span><kbd>DEL</kbd><span>Store</span></>}
      </div>

      {demo && <div className="fab-demo-exit"><span><b>DEMO MODE</b><small>No wallet. Layout saved only on this device.</small></span><Link href="/start">Create your company</Link></div>}
    </main>
  );
}
