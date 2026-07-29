'use client';

// The four desk silhouettes, built from flat-shaded primitives.
//
// Each model is designed to read at a glance from a fixed isometric angle, so
// they are distinguished by SHAPE first and material second: a tall tower, a
// squat vault, a round tank, a flat stack. That matters more here than in a
// free-camera scene — the player never rotates the view, so a silhouette that
// only resolves from one side would never resolve at all.
//
// Bodies are ordinary materials — painted panel, concrete, steel, wood. The
// `accent` a caller passes is treated as BRANDING: a signage strip or status
// lamp, never the whole object. Painting the bodies with it is what turned the
// first version of this scene into a single green mass.

import { ISO, type MachineKind } from './palette';
import { DESK_LIVERIES, PLINTH_LIVERIES, resolveSurface } from './desk-liveries';

/**
 * The desk and plinth cosmetics this wallet has equipped.
 *
 * Applied to EVERY desk on the floor rather than to one, which is what the shop
 * copy promises — "across every desk" is the reason a livery is worth more than
 * a single skin would be.
 */
export interface DeskLivery {
  desk?: string | null;
  deskLevel?: number;
  plinth?: string | null;
  plinthLevel?: number;
}

interface DeskProps {
  accent: string;
  selected?: boolean;
  hovered?: boolean;
  livery?: DeskLivery;
}

/** Shared surface treatment: matte, faceted, no imported maps. */
function surface(color: string, emissive?: string, intensity = 0) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      roughness={0.72}
      metalness={0.08}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={intensity}
    />
  );
}

function metal(color: string) {
  return <meshStandardMaterial color={color} flatShading roughness={0.42} metalness={0.55} />;
}

/** 0..1 polish from an upgrade rank, so a refined livery is visibly refined. */
const polishOf = (level = 0) => Math.max(0, Math.min(5, level)) / 5;

/**
 * The painted panel every desk body uses — unless a livery replaces it.
 *
 * Brushed Steel swaps the paint for metal and gets glossier with each
 * refinement, which is the whole visible payoff of the upgrade track on this
 * slot: same silhouette, better finish.
 */
// `fallback` is annotated because ISO is `as const`: without it the default
// narrows the parameter to the literal '#d4d2cf' and no other palette colour
// can be passed.
function body(livery: DeskLivery | undefined, fallback: string = ISO.paint) {
  const def = livery?.desk ? DESK_LIVERIES[livery.desk] : undefined;
  if (def?.body) {
    const { color, roughness, metalness } = resolveSurface(def.body, polishOf(livery?.deskLevel));
    return <meshStandardMaterial color={color} flatShading roughness={roughness} metalness={metalness} />;
  }
  return surface(fallback);
}

/**
 * Whatever extra geometry the equipped desk livery asks for, at the foot of the
 * body.
 *
 * One component for every livery feature rather than one per cosmetic. Adding a
 * recoloured band or a new bar colour is now a row in desk-liveries.ts; only a
 * genuinely new SHAPE needs a branch here, and a livery whose feature is not
 * handled draws nothing rather than throwing.
 */
function DeskFeature({ livery, y, width }: { livery?: DeskLivery; y: number; width: number }) {
  const def = livery?.desk ? DESK_LIVERIES[livery.desk] : undefined;
  if (!def?.feature) return null;
  const polish = polishOf(livery?.deskLevel);
  const color = def.featureColor ?? ISO.accent;
  const material = def.featureLit ? (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={1.1 + polish * 1.5}
      toneMapped={false}
      flatShading
    />
  ) : (
    surface(color)
  );

  switch (def.feature) {
    case 'band':
      return (
        <mesh position={[0, y, 0]}>
          <boxGeometry args={[width, 0.045, width]} />
          {material}
        </mesh>
      );
    case 'crawl':
      // Thinner than a band and set slightly proud, so it reads as tape wrapped
      // round the housing rather than as part of it.
      return (
        <mesh position={[0, y + 0.02, 0]}>
          <boxGeometry args={[width * 1.04, 0.022, width * 1.04]} />
          {material}
        </mesh>
      );
    case 'candles':
      // Four bars stepping up one face. They only ever go up, which is the joke.
      return (
        <group position={[0, y, width / 2 + 0.01]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[(i - 1.5) * width * 0.22, 0.05 + i * 0.055, 0]}>
              <boxGeometry args={[width * 0.14, 0.06 + i * 0.09, 0.03]} />
              {material}
            </mesh>
          ))}
        </group>
      );
    case 'patches':
      // Mismatched panel patches on two faces. Fixed offsets rather than hashed
      // ones: every desk on the floor wears the same livery, and randomising it
      // per desk would read as damage instead of as a uniform.
      return (
        <group position={[0, y, 0]}>
          {[
            [width / 2 + 0.005, 0.28, 0, Math.PI / 2],
            [0, 0.52, width / 2 + 0.005, 0],
          ].map(([x, yy, z, rot], i) => (
            <mesh key={i} position={[x, yy, z]} rotation={[0, rot, 0]}>
              <boxGeometry args={[width * 0.42, 0.2, 0.02]} />
              {surface(def.featureColor ?? '#8a8378')}
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

/** Every desk stands on the same plinth, so mixed layouts look like a set. */
function Plinth({ accent, glow, livery }: { accent: string; glow: boolean; livery?: DeskLivery }) {
  const def = livery?.plinth ? PLINTH_LIVERIES[livery.plinth] : undefined;
  const polish = polishOf(livery?.plinthLevel);
  // Only the plate raises the plinth — every other feature sits on or beside it.
  const plated = def?.feature === 'plate';
  const top = def?.surface ? resolveSurface(def.surface, polish) : null;
  const featureColor = def?.featureColor ?? ISO.amber;
  return (
    <group>
      {/* Founder's Plate sits UNDER the plinth rather than replacing it: the
          shop calls it "an engraved plate under every desk", and a cosmetic
          that does something other than what it sold is worse than none. */}
      {plated && (
        <>
          <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.02, 0.03, 1.02]} />
            <meshStandardMaterial
              color={featureColor}
              flatShading
              roughness={0.3 - polish * 0.18}
              metalness={0.7 + polish * 0.25}
            />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.48, 4]} />
            <meshBasicMaterial
              color={ISO.bright}
              transparent
              opacity={0.35 + polish * 0.5}
              toneMapped={false}
            />
          </mesh>
        </>
      )}

      {/* Hazard chevrons and the substation trench are painted AROUND the base
          rather than on top of it, so the desk still sits flat on its plinth. */}
      {def?.feature === 'chevrons' && (
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.52, 0.68, 4]} />
          <meshBasicMaterial color={featureColor} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      )}
      {def?.feature === 'trench' && (
        <mesh position={[0, 0.006, 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.34, 0.5]} />
          {surface(featureColor)}
        </mesh>
      )}
      {def?.feature === 'slats' && (
        <group position={[0, 0.03, 0]}>
          {[-0.28, 0, 0.28].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <boxGeometry args={[0.92, 0.05, 0.16]} />
              {surface(featureColor)}
            </mesh>
          ))}
        </group>
      )}

      <mesh position={[0, plated ? 0.09 : 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.86, 0.14, 0.86]} />
        {top ? (
          <meshStandardMaterial
            color={top.color}
            flatShading
            roughness={top.roughness}
            metalness={top.metalness}
          />
        ) : (
          metal(ISO.steelDark)
        )}
      </mesh>
      {glow && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 4]} />
          <meshBasicMaterial color={accent} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Equity Desk — a glass-and-panel tower. Tallest silhouette on the board. */
function EquityDesk({ accent, selected, hovered, livery }: DeskProps) {
  const lit = Boolean(selected || hovered);
  return (
    <group>
      <Plinth accent={accent} glow={lit} livery={livery} />
      <DeskFeature livery={livery} y={0.24} width={0.56} />
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 1.48, 0.52]} />
        {body(livery)}
      </mesh>
      {/* Glazing on the front face. */}
      {[0.55, 0.95, 1.35].map((y) => (
        <mesh key={y} position={[0, y, 0.27]}>
          <boxGeometry args={[0.44, 0.22, 0.04]} />
          {surface(ISO.glass, ISO.glass, lit ? 0.5 : 0.18)}
        </mesh>
      ))}
      {/* Branded signage band — the only green on the model. */}
      <mesh position={[0, 1.66, 0.2]}>
        <boxGeometry args={[0.46, 0.12, 0.14]} />
        {surface(accent, accent, lit ? 1.3 : 0.75)}
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <boxGeometry args={[0.66, 0.12, 0.66]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0, 2.12, 0]} castShadow>
        <boxGeometry args={[0.1, 0.56, 0.1]} />
        {metal(ISO.steelDark)}
      </mesh>
      <mesh position={[0, 2.44, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        {surface(ISO.danger, ISO.danger, 1.1)}
      </mesh>
    </group>
  );
}

/** Treasury Desk — a concrete vault with a brass door. */
function TreasuryDesk({ accent, selected, hovered, livery }: DeskProps) {
  const lit = Boolean(selected || hovered);
  return (
    <group>
      <Plinth accent={accent} glow={lit} livery={livery} />
      <DeskFeature livery={livery} y={0.22} width={0.82} />
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.72, 0.78]} />
        {body(livery, ISO.concrete)}
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0, 0.54, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.06, 8]} />
        {metal(ISO.amber)}
      </mesh>
      {/* Status lamp above the door. */}
      <mesh position={[0, 0.86, 0.36]}>
        <boxGeometry args={[0.16, 0.05, 0.05]} />
        {surface(accent, accent, lit ? 1.3 : 0.8)}
      </mesh>
      <mesh position={[0.24, 1.16, -0.2]} castShadow>
        <boxGeometry args={[0.22, 0.24, 0.22]} />
        {metal(ISO.steelDark)}
      </mesh>
    </group>
  );
}

/** Liquidity Desk — a steel tank. The only curved silhouette. */
function LiquidityDesk({ accent, selected, hovered, livery }: DeskProps) {
  const lit = Boolean(selected || hovered);
  return (
    <group>
      <Plinth accent={accent} glow={lit} livery={livery} />
      <DeskFeature livery={livery} y={0.22} width={0.72} />
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.86, 7]} />
        {body(livery)}
      </mesh>
      {/* Sight glass showing the level inside. */}
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.31, 0.31, 0.22, 7]} />
        {surface(ISO.glass, ISO.glass, lit ? 0.55 : 0.2)}
      </mesh>
      <mesh position={[0, 0.86, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.05, 5, 12]} />
        {metal(ISO.steelDark)}
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.2, 7]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0, 1.26, 0]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        {surface(accent, accent, lit ? 1.2 : 0.7)}
      </mesh>
    </group>
  );
}

/** Structured Desk — a low stack of ledgers. Deliberately the flattest shape. */
function StructuredDesk({ accent, selected, hovered, livery }: DeskProps) {
  const lit = Boolean(selected || hovered);
  return (
    <group>
      <Plinth accent={accent} glow={lit} livery={livery} />
      <DeskFeature livery={livery} y={0.19} width={0.84} />
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.2, 0.8]} />
        {surface(ISO.wood)}
      </mesh>
      <mesh position={[0.06, 0.45, 0.06]} castShadow>
        <boxGeometry args={[0.62, 0.14, 0.62]} />
        {body(livery)}
      </mesh>
      <mesh position={[-0.04, 0.58, -0.04]} castShadow>
        <boxGeometry args={[0.44, 0.12, 0.44]} />
        {surface(ISO.woodDark)}
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.1, 0.14, 0.1]} />
        {surface(accent, accent, lit ? 1.2 : 0.7)}
      </mesh>
    </group>
  );
}

const MODELS: Record<MachineKind, (props: DeskProps) => React.JSX.Element> = {
  equity: EquityDesk,
  rack: TreasuryDesk,
  cooling: LiquidityDesk,
  settlement: StructuredDesk,
};

/** Approximate model height, so callers can float a label above one. */
export const DESK_HEIGHT: Record<MachineKind, number> = {
  equity: 2.6,
  rack: 1.3,
  cooling: 1.35,
  settlement: 0.8,
};

export default function Desk({ kind, ...props }: DeskProps & { kind: MachineKind }) {
  const Model = MODELS[kind] ?? EquityDesk;
  return <Model {...props} />;
}
