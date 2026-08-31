'use client';

// The seven weapons, as models.
//
// They had none. Axes were a line in a shop list and crossbows were a crafting
// recipe that produced a row in a table — the only thing in the game that could
// kill you had no picture anywhere, including in the hands of the person
// swinging it.
//
// BUILT TO BE READ AT TWO SIZES, which is the constraint that shapes all of
// them: a 44px marketplace thumbnail, and held by a character seen from a fixed
// isometric camera at about a fortieth of the screen. So the SILHOUETTE carries
// the identity — a hatchet is a stub, a felling axe is a long haft, a crossbow
// is a horizontal bow across a stock — and detail is spent only where it
// survives being small. Same argument DeskModels makes for the desks.
//
// THE TIER IS IN THE MATERIAL, NOT THE SIZE. A player should be able to tell an
// Ironbark Axe from a Hatchet across a clearing, and scaling weapons up per tier
// would make the top one comical and the bottom one invisible. Instead the head
// goes from iron to steel to blued steel, the haft from pine to oak to
// ironbark, and only the ironbark tier gets an emissive line — the one piece of
// the game's brand colour that is earned rather than decorative.
//
// Robin Neon appears NOWHERE on these. CLAUDE.md: the neon is branding, signage
// and status — never the world. Ironbark's glow is its own amber.

import { ISO } from './palette';

/** Matte, faceted, no imported maps — the treatment every model here shares. */
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

function metal(color: string, roughness = 0.36) {
  return <meshStandardMaterial color={color} flatShading roughness={roughness} metalness={0.65} />;
}

/**
 * The material ladder, by tier.
 *
 * One table rather than per-model constants, so "tier 3 is blued steel and oak"
 * is true of every weapon at tier 3 and a retune is one edit. The glow is what
 * separates ironbark from everything below it and is deliberately amber rather
 * than the brand's neon.
 */
const TIER = {
  1: { head: '#8d8b85', haft: ISO.wood, glow: null as string | null },
  2: { head: '#a8a6a0', haft: ISO.wood, glow: null as string | null },
  3: { head: '#7c8894', haft: ISO.woodDark, glow: null as string | null },
  4: { head: '#5f6b78', haft: '#3f2f1e', glow: ISO.amber as string | null },
} as const;

type Tier = keyof typeof TIER;
const tierOf = (t: number): Tier => (Math.min(4, Math.max(1, Math.round(t))) as Tier);

/* -------------------------------------------------------------------------
   Axes. The silhouette is haft length and head mass.
   ------------------------------------------------------------------------- */

function Axe({ tier, haft, head, bit }: { tier: number; haft: number; head: number; bit: number }) {
  const mat = TIER[tierOf(tier)];
  return (
    <group>
      {/* Haft, laid along Z so the whole weapon reads as a line from the iso
          camera rather than foreshortening into a dot. */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.042, haft, 6]} />
        {surface(mat.haft)}
      </mesh>
      {/* Butt cap, so the bottom of the haft is not an open tube. */}
      <mesh position={[0, 0, haft / 2 - 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.06, 6]} />
        {metal(mat.head, 0.5)}
      </mesh>
      {/* Head: a wedge, offset to one side. An axe that is symmetrical about
          its haft reads as a hammer. */}
      <mesh position={[bit / 2, 0, -haft / 2 + head / 2]} castShadow>
        <boxGeometry args={[bit, head, head * 0.62]} />
        {metal(mat.head)}
      </mesh>
      {/* The bit — a thinner leading edge, which is the whole reason it looks
          like an axe at 44 pixels. */}
      <mesh position={[bit * 1.02, 0, -haft / 2 + head / 2]} castShadow>
        <boxGeometry args={[bit * 0.5, head * 0.92, head * 0.2]} />
        {metal('#cfd4d8', 0.22)}
      </mesh>
      {/* Collar where head meets haft. */}
      <mesh position={[0, 0, -haft / 2 + head * 0.75]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.1, 6]} />
        {metal(mat.head, 0.45)}
      </mesh>
      {mat.glow && (
        <mesh position={[bit / 2, 0, -haft / 2 + head / 2]}>
          <boxGeometry args={[bit * 1.04, head * 0.16, head * 0.66]} />
          <meshStandardMaterial color={mat.glow} emissive={mat.glow} emissiveIntensity={1.6} flatShading />
        </mesh>
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Crossbows. The silhouette is the prod across the stock.
   ------------------------------------------------------------------------- */

function Crossbow({ tier, span, stock }: { tier: number; span: number; stock: number }) {
  const mat = TIER[tierOf(tier)];
  return (
    <group>
      {/* Stock, along Z. */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.09, 0.075, stock]} />
        {surface(mat.haft)}
      </mesh>
      {/* The butt, angled down — the line that says "shoulder weapon". */}
      <mesh position={[0, -0.045, stock / 2 - 0.06]} rotation={[0.34, 0, 0]} castShadow>
        <boxGeometry args={[0.085, 0.13, 0.22]} />
        {surface(mat.haft)}
      </mesh>
      {/* Prod, across X at the front. The one shape nothing else in the game
          has, and the reason a crossbow is identifiable at thumbnail size. */}
      <mesh position={[0, 0.02, -stock / 2 + 0.1]} castShadow>
        <boxGeometry args={[span, 0.05, 0.06]} />
        {metal(mat.head)}
      </mesh>
      {/* Limb tips, swept back so the prod is not a plain bar. */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[(s * span) / 2, 0.02, -stock / 2 + 0.16]}
          rotation={[0, s * 0.5, 0]}
          castShadow
        >
          <boxGeometry args={[span * 0.22, 0.045, 0.05]} />
          {metal(mat.head)}
        </mesh>
      ))}
      {/* String, drawn back to the nut. */}
      <mesh position={[0, 0.02, -stock / 2 + 0.3]} castShadow>
        <boxGeometry args={[span * 0.82, 0.014, 0.014]} />
        {surface('#cfc6b0')}
      </mesh>
      {/* The nut and trigger housing. */}
      <mesh position={[0, 0.06, 0.02]} castShadow>
        <boxGeometry args={[0.1, 0.06, 0.16]} />
        {metal('#6f6d67', 0.5)}
      </mesh>
      <mesh position={[0, -0.07, 0.06]} rotation={[0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.03, 0.1, 0.03]} />
        {metal('#6f6d67', 0.5)}
      </mesh>
      {/* A nocked bolt, so a loaded crossbow looks loaded. */}
      <mesh position={[0, 0.055, -stock / 2 + 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.44, 5]} />
        {surface(mat.glow ? '#5a4326' : ISO.woodDark, mat.glow ?? undefined, mat.glow ? 0.5 : 0)}
      </mesh>
      {mat.glow && (
        <mesh position={[0, 0.02, -stock / 2 + 0.1]}>
          <boxGeometry args={[span * 1.01, 0.016, 0.07]} />
          <meshStandardMaterial color={mat.glow} emissive={mat.glow} emissiveIntensity={1.6} flatShading />
        </mesh>
      )}
    </group>
  );
}

/**
 * The seven, keyed by the ids lib/weapons uses.
 *
 * Dimensions climb gently rather than dramatically — a Felling Axe is a longer
 * haft than a Hatchet, not a bigger everything. See the header on why tier
 * lives in the material.
 */
const MODELS: Record<string, () => React.JSX.Element> = {
  hatchet: () => <Axe tier={1} haft={0.58} head={0.19} bit={0.1} />,
  felling: () => <Axe tier={2} haft={0.86} head={0.23} bit={0.12} />,
  splitting: () => <Axe tier={3} haft={0.92} head={0.29} bit={0.16} />,
  'ironbark-axe': () => <Axe tier={4} haft={1.0} head={0.33} bit={0.18} />,
  'hunting-crossbow': () => <Crossbow tier={2} span={0.72} stock={0.78} />,
  'heavy-crossbow': () => <Crossbow tier={3} span={0.86} stock={0.9} />,
  'ironbark-crossbow': () => <Crossbow tier={4} span={1.0} stock={0.98} />,
};

export default function WeaponModel({ id }: { id: string }) {
  const Model = MODELS[id];
  // An unknown id draws nothing rather than a stand-in. A wrong weapon in
  // somebody's hand is worse information than an empty one.
  return Model ? <Model /> : null;
}
