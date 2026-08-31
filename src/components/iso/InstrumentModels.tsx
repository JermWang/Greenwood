'use client';

// The eight instruments, as models.
//
// They did not have any. Instruments are the most-traded thing in the game and
// the only picture of one was a typographic tile — ComponentTile, whose own
// header admits it is a placeholder waiting for art. So a marketplace row for a
// Divine Order Router and a Common Coupon Engine differed by a glyph and a
// border colour, which is not what a player has in mind when they are deciding
// whether to pay 96,000 for one.
//
// SHAPE FIRST, exactly as DeskModels argues for the desks: the camera never
// rotates, so a silhouette that only resolves from one angle never resolves.
// Each of these is a distinct outline at a glance — a ring, a manifold, a mast,
// a cart, a ladder, a drum. Two instruments that read the same from the iso
// angle would be two instruments a player cannot tell apart in their locker.
//
// RARITY IS THE ONLY THING THE TINT CARRIES, and it lands on a lamp, a core or
// an emissive band — never on the body. Same rule DeskModels follows for the
// brand accent, and for the same reason: painting whole objects in the status
// colour turns a shelf of instruments into a shelf of coloured blobs, and the
// SHAPE stops doing the work. Bodies stay steel, concrete and wood.

import { ISO } from './palette';
import { rarityHex, type Rarity } from '@/lib/rarity';

/** Matte, faceted, no imported maps — the same treatment the desks use. */
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

/** The rarity element: lit, small, and the only coloured thing on the model. */
function core(hex: string, strength: number) {
  return <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={strength} flatShading />;
}

interface PartProps {
  hex: string;
  /** How hard the rarity element glows. Higher rarities read hotter. */
  glow: number;
}

/* -------------------------------------------------------------------------
   Equity family — the oil-side slots. Vertical, mechanical, exposed.
   ------------------------------------------------------------------------- */

/** Execution Terminal (derrick): a lattice mast with a lit head. */
function ExecutionTerminal({ hex, glow }: PartProps) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.12, 0.62]} />
        {surface(ISO.concreteDark)}
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.16, 0.46, sz * 0.16]} castShadow>
            <boxGeometry args={[0.05, 0.68, 0.05]} />
            {metal(ISO.steelDark)}
          </mesh>
        ))
      )}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 0.04, 0.4]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.24, 0.16, 0.24]} />
        {core(hex, glow)}
      </mesh>
    </group>
  );
}

/** Order Router (pump_jack): a counterweighted beam mid-stroke. */
function OrderRouter({ hex, glow }: PartProps) {
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.14, 0.44]} />
        {surface(ISO.concreteDark)}
      </mesh>
      <mesh position={[0.04, 0.34, 0]} castShadow>
        <boxGeometry args={[0.12, 0.44, 0.12]} />
        {metal(ISO.steelDark)}
      </mesh>
      {/* The beam, tipped, so the silhouette is never symmetrical. */}
      <mesh position={[0, 0.6, 0]} rotation={[0, 0, 0.28]} castShadow>
        <boxGeometry args={[0.78, 0.08, 0.1]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[-0.34, 0.5, 0]} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.14]} />
        {surface(ISO.rubber)}
      </mesh>
      <mesh position={[0.36, 0.72, 0]} castShadow>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        {core(hex, glow)}
      </mesh>
    </group>
  );
}

/** Market Data Feed (pipeline): a run of pipe over saddles, with a lit valve. */
function MarketDataFeed({ hex, glow }: PartProps) {
  return (
    <group>
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.24, 0.3]} />
          {surface(ISO.concrete)}
        </mesh>
      ))}
      <mesh position={[0, 0.34, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.86, 8]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0.02, 0.52, 0]} castShadow>
        <boxGeometry args={[0.16, 0.14, 0.16]} />
        {core(hex, glow)}
      </mesh>
      <mesh position={[-0.34, 0.34, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.06, 8]} />
        {metal(ISO.steelDark)}
      </mesh>
    </group>
  );
}

/** Settlement Rail (flare_stack): a stack with the flame as the rarity element. */
function SettlementRail({ hex, glow }: PartProps) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.16, 0.44]} />
        {surface(ISO.concreteDark)}
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.14, 0.72, 8]} />
        {metal(ISO.steelDark)}
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.1, 0.12, 8]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0, 1.06, 0]}>
        <coneGeometry args={[0.11, 0.2, 8]} />
        {core(hex, glow * 1.4)}
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------
   Treasury family — the mine-side slots. Low, heavy, horizontal.
   ------------------------------------------------------------------------- */

/** Custody Module (instrument): a sealed case with a readout. */
function CustodyModule({ hex, glow }: PartProps) {
  return (
    <group>
      <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.5, 0.44]} />
        {surface(ISO.paint)}
      </mesh>
      <mesh position={[0, 0.53, 0]} castShadow>
        <boxGeometry args={[0.66, 0.06, 0.48]} />
        {metal(ISO.steelDark)}
      </mesh>
      <mesh position={[0, 0.3, 0.23]}>
        <boxGeometry args={[0.32, 0.18, 0.02]} />
        {core(hex, glow)}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.34, 0.3, 0]} castShadow>
          <boxGeometry args={[0.04, 0.34, 0.28]} />
          {metal(ISO.steel)}
        </mesh>
      ))}
    </group>
  );
}

/** Coupon Engine (ore_cart): a tipper on rails, heaped and lit from inside. */
function CouponEngine({ hex, glow }: PartProps) {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.34, 0.42]} />
        {surface(ISO.rubber)}
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.32]} />
        {core(hex, glow)}
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.22, 0.12, sz * 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.11, 0.05, 8]} />
            {metal(ISO.steelDark)}
          </mesh>
        ))
      )}
    </group>
  );
}

/** Maturity Ladder (rail_track): sleepers and rail, stepping up. */
function MaturityLadder({ hex, glow }: PartProps) {
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.2, 0.06 + i * 0.07, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 0.09, 0.5]} />
          {surface(ISO.woodDark)}
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.3, s * 0.18]} rotation={[0, 0, 0.34]} castShadow>
          <boxGeometry args={[0.86, 0.05, 0.05]} />
          {metal(ISO.steel)}
        </mesh>
      ))}
      <mesh position={[0.36, 0.42, 0]} castShadow>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        {core(hex, glow)}
      </mesh>
    </group>
  );
}

/** Liquidity Buffer (elevator): a drum on a frame, wound with cable. */
function LiquidityBuffer({ hex, glow }: PartProps) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.58, 0.12, 0.46]} />
        {surface(ISO.concreteDark)}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.24, 0.4, 0]} castShadow>
          <boxGeometry args={[0.08, 0.56, 0.1]} />
          {metal(ISO.steelDark)}
        </mesh>
      ))}
      <mesh position={[0, 0.56, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.38, 10]} />
        {metal(ISO.steel)}
      </mesh>
      <mesh position={[0, 0.56, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.21, 0.21, 0.1, 10]} />
        {core(hex, glow)}
      </mesh>
    </group>
  );
}

const MODELS: Record<string, (props: PartProps) => React.JSX.Element> = {
  derrick: ExecutionTerminal,
  pump_jack: OrderRouter,
  pipeline: MarketDataFeed,
  flare_stack: SettlementRail,
  instrument: CustodyModule,
  ore_cart: CouponEngine,
  rail_track: MaturityLadder,
  elevator: LiquidityBuffer,
};

// The slot LIST lives in lib/rarity, not here. It is data, and this module is
// a renderer — see the note there for the build failure that taught us the
// difference. An unknown slot falls back rather than throwing, below.

/**
 * How hot the rarity element burns, by rarity.
 *
 * Deliberately NOT linear with the multiplier: the difference a player needs to
 * see at a glance is between the bottom of the table and the top, and a curve
 * that spends most of its range on Common-to-Rare leaves Mythic and Divine
 * looking alike — which are exactly the two whose prices differ most.
 */
const GLOW: Record<Rarity, number> = {
  common: 0.25,
  uncommon: 0.5,
  rare: 0.9,
  epic: 1.4,
  legendary: 2.1,
  mythic: 3,
  divine: 4.2,
};

export default function Instrument({
  slot,
  rarity = 'common',
}: {
  slot: string;
  rarity?: Rarity;
}) {
  const Model = MODELS[slot] ?? CustodyModule;
  return <Model hex={rarityHex(rarity)} glow={GLOW[rarity] ?? 0.5} />;
}
