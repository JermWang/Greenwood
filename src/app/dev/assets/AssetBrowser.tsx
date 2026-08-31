'use client';

// The asset builder: every model in the game, on a turntable, with its variants.
//
// Deliberately NOT under /app. Everything there is a room a player can be in,
// and this is a workbench — it has no place in the nav rail and no business
// being reachable in a build where the dev bypass is off.
//
// The preview renders the REAL components with the REAL lighting rig, not
// stand-ins. A viewer that draws its own approximation of a desk will happily
// show you a desk that looks fine while the one in the Machine Room is broken,
// which is the one failure this page exists to prevent.

import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Lighting } from '@/components/iso/IsoScene';
import Desk from '@/components/iso/DeskModels';
import Instrument from '@/components/iso/InstrumentModels';
import WeaponModel from '@/components/iso/WeaponModels';
import type { Rarity } from '@/lib/rarity';
import Character, { lookFor } from '@/components/iso/Character';
import * as Dressing from '@/components/iso/MapDressing';
import * as Outdoor from '@/components/iso/OutdoorDressing';
import * as Creatures from '@/components/iso/Creatures';
import { ISO, ISO_OFFSET, type MachineKind } from '@/components/iso/palette';
import { ASSETS, CATEGORIES, assetCounts, type AssetEntry, type AssetVariant } from '@/lib/asset-registry';

/** A single-object stage, for sizing the shadow camera. */
const PREVIEW_BOUNDS = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };

/** Slowly rotates whatever is inside it, so every face gets looked at. */
function Turntable({ spin, children }: { spin: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current && spin) ref.current.rotation.y += delta * 0.5;
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Draw one asset.
 *
 * A switch rather than a component map because the props genuinely differ per
 * family — a desk takes a kind and a livery, a character takes a look and a
 * target, a prop takes a position. Pretending they share a signature would mean
 * a wrapper per asset, which is more code to keep in step, not less.
 */
function Preview({ entry, variant, walking, self, refined, armed }: { entry: AssetEntry; variant: AssetVariant; walking: boolean; self: boolean; refined: boolean; armed: boolean }) {
  const props = variant.props;

  if (entry.category === 'weapon') {
    return <WeaponModel id={props.weapon as string} />;
  }

  if (entry.category === 'instrument') {
    return <Instrument slot={props.slot as string} rarity={props.rarity as Rarity} />;
  }

  if (entry.category === 'desk') {
    return (
      <Desk
        kind={(props.kind as MachineKind) ?? 'equity'}
        accent={ISO.accent}
        livery={props.livery as never}
      />
    );
  }

  if (entry.id === 'character') {
    const look = lookFor({
      wallet: '0x00000000000000000000000000000000000de401',
      outfit: (props.outfit as string) ?? null,
      // Rank 0 and not-self by default. Own-avatar styling adds a neon cap
      // and a selection ring, and a high rank pushes the trim's emissive up —
      // between them they swamp the cosmetic you came here to look at. Both are
      // real in-game looks, so they are toggles rather than removals.
      outfitLevel: refined ? 5 : 0,
      isSelf: self,
    });
    // Walking is derived from motion, not commanded, so the only honest way to
    // preview the walk cycle is to actually send the character somewhere. It
    // paces between two tiles; standing still shows the idle.
    return (
      <Character
        look={look}
        target={walking ? { x: 0, z: 2 } : { x: 0, z: 0 }}
        weapon={armed ? 'felling' : null}
        spawn={{ x: 0, z: -2 }}
        name={undefined}
      />
    );
  }

  if (entry.id === 'portal') {
    return (
      <Dressing.Portal
        position={[0, 0]}
        facing={(props.facing as number) ?? 0}
        label="Machine Room"
        active
        onEnter={() => {}}
      />
    );
  }

  // Dressing, architecture and outdoors: every one takes `position`, and the id
  // prefix says which module to look in. Resolved by name rather than through a
  // registry of imports so that adding a prop is one entry in asset-registry and
  // nothing here.
  const [prefix, ...rest] = entry.id.split('-');
  const name = rest.join('-');
  const namespace =
    prefix === 'outdoor' ? Outdoor : prefix === 'creature' ? Creatures : Dressing;
  const Component = (namespace as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[name];
  if (!Component) return null;
  return <Component position={[0, 0]} {...props} />;
}

export default function AssetBrowser() {
  const [selectedId, setSelectedId] = useState(ASSETS[0].id);
  const [variantId, setVariantId] = useState(ASSETS[0].variants[0].id);
  const [spin, setSpin] = useState(true);
  const [walking, setWalking] = useState(false);
  const [self, setSelf] = useState(false);
  const [refined, setRefined] = useState(false);
  /** Puts an axe in the avatar's hand, so the grip can be checked on the model
      that actually carries it rather than on a floating weapon. */
  const [armed, setArmed] = useState(false);
  const [grid, setGrid] = useState(true);

  const entry = useMemo(() => ASSETS.find((a) => a.id === selectedId)!, [selectedId]);
  const variant = useMemo(
    () => entry.variants.find((v) => v.id === variantId) ?? entry.variants[0],
    [entry, variantId]
  );
  const counts = assetCounts();

  const select = (id: string) => {
    const next = ASSETS.find((a) => a.id === id)!;
    setSelectedId(id);
    // Variant ids are per-asset, so carrying one across would silently fall back
    // to the first variant and look like the picker had ignored the click.
    setVariantId(next.variants[0].id);
  };

  return (
    <div className="ab">
      <aside className="ab-list">
        <header>
          <b>Assets</b>
          <small>
            {counts.assets} models · {counts.variants} variants · {counts.animated} animated
          </small>
        </header>
        {CATEGORIES.map((category) => {
          const items = ASSETS.filter((a) => a.category === category.id);
          if (!items.length) return null;
          return (
            <section key={category.id}>
              <h3>{category.label}</h3>
              {items.map((item) => (
                <button
                  key={item.id}
                  className={item.id === selectedId ? 'is-on' : ''}
                  onClick={() => select(item.id)}
                >
                  {item.name}
                  <i>{item.variants.length}</i>
                </button>
              ))}
            </section>
          );
        })}
      </aside>

      <main className="ab-stage">
        <div className="ab-canvas">
          <Canvas
            orthographic
            camera={{ position: ISO_OFFSET, zoom: 90 / entry.scale, near: -400, far: 600 }}
            shadows
          >
            {/* Tight bounds so the shadow camera is sized for one object rather
                than a whole room — a room-sized shadow map on a single desk
                spends its whole resolution on empty floor and the contact
                shadow goes soft, which would misrepresent how the model
                actually looks in the Machine Room. */}
            <Lighting bounds={PREVIEW_BOUNDS} />
            <Suspense fallback={null}>
              <Turntable spin={spin}>
                <Preview entry={entry} variant={variant} walking={walking} self={self} refined={refined} armed={armed} />
              </Turntable>
            </Suspense>
            {grid && (
              <gridHelper args={[10, 10, ISO.steelDark, '#3a3831']} position={[0, 0.001, 0]} />
            )}
          </Canvas>
        </div>

        <div className="ab-controls">
          <label>
            <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Turntable
          </label>
          <label>
            <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid
          </label>
          {entry.id === 'character' && (
            <>
              <label>
                <input type="checkbox" checked={walking} onChange={(e) => setWalking(e.target.checked)} /> Walk
              </label>
              <label>
                <input type="checkbox" checked={self} onChange={(e) => setSelf(e.target.checked)} /> Own avatar
              </label>
              <label>
                <input type="checkbox" checked={refined} onChange={(e) => setRefined(e.target.checked)} /> Max rank
              </label>
              {/* The grip is only checkable on the thing that holds it. A
                  weapon that looks right on a turntable can still sit through
                  the wrist once an arm is swinging it. */}
              <label>
                <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} /> Armed
              </label>
            </>
          )}
        </div>
      </main>

      <aside className="ab-detail">
        <h2>{entry.name}</h2>
        <p>{entry.blurb}</p>
        <code>{entry.source}</code>

        <h3>Variants</h3>
        <div className="ab-variants">
          {entry.variants.map((v) => (
            <button
              key={v.id}
              className={v.id === variant.id ? 'is-on' : ''}
              onClick={() => setVariantId(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <h3>Animation</h3>
        {entry.animations.length ? (
          <ul className="ab-anims">
            {entry.animations.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="ab-muted">Static — no animated states.</p>
        )}

        <h3>Props</h3>
        <pre>{JSON.stringify(variant.props, null, 2) || '{}'}</pre>
      </aside>
    </div>
  );
}
