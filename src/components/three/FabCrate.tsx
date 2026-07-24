import { RoundedBox } from '@react-three/drei';

/**
 * A supply pod in the fab equipment's visual language.
 *
 * The old crates were brown wooden chests from the oil/mining theme; nothing
 * about them matched the semiconductor floor. This rebuilds the crate from the
 * same vocabulary the fab machines use — a dark metal plinth, a white rounded
 * clearcoat shell, a cobalt viewing window, orange safety latch, and a lime
 * status beacon — so a crate reads as part of the same facility.
 *
 * `accent` tints the parts that carry rarity: the seam glow, the beacon, and the
 * emblem behind the window. Feed it the rarity tint from src/lib/rarity.ts and a
 * common crate is a neutral pod while a divine one glows white.
 */
export function FabCrate({ accent = '#5bd6ff' }: { accent?: string } = {}) {
  return (
    <group name="supply-pod">
      {/* Dark metal plinth — the same base the EUV core and rack sit on. */}
      <RoundedBox args={[2.25, 0.34, 2.25]} radius={0.1} smoothness={3} position={[0, 0.17, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#202936" metalness={0.52} roughness={0.36} />
      </RoundedBox>

      {/* White clearcoat body. */}
      <RoundedBox args={[2.0, 1.5, 2.0]} radius={0.3} smoothness={4} position={[0, 1.06, 0]} castShadow>
        <meshPhysicalMaterial color="#eff3f7" roughness={0.44} clearcoat={0.22} clearcoatRoughness={0.5} />
      </RoundedBox>

      {/* Lid, slightly proud of the body, with an accent seam glowing between the
          two — this is the line the pod opens along. */}
      <mesh position={[0, 1.82, 0]}>
        <boxGeometry args={[2.06, 0.05, 2.06]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <RoundedBox args={[2.04, 0.42, 2.04]} radius={0.28} smoothness={4} position={[0, 2.08, 0]} castShadow>
        <meshPhysicalMaterial color="#f6f9fb" roughness={0.4} clearcoat={0.3} />
      </RoundedBox>

      {/* Cobalt viewing window on the front, with a rarity-tinted core behind it. */}
      <RoundedBox args={[1.28, 0.86, 0.06]} radius={0.13} smoothness={3} position={[0, 1.12, 1.0]}>
        <meshPhysicalMaterial color="#0c3d98" metalness={0.35} roughness={0.18} clearcoat={0.5} />
      </RoundedBox>
      <mesh position={[0, 1.12, 1.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.05, 32]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.12, 1.03]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.03, 12, 40]} />
        <meshStandardMaterial color="#6de6ff" emissive="#22bfff" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>

      {/* Orange safety latch below the window. */}
      <RoundedBox args={[0.6, 0.2, 0.09]} radius={0.05} smoothness={2} position={[0, 0.55, 1.0]}>
        <meshPhysicalMaterial color="#ff8a25" emissive="#ff7916" emissiveIntensity={0.6} roughness={0.22} />
      </RoundedBox>

      {/* Dark corner posts, echoing the accelerator rack's frame. */}
      {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) => (
        <mesh key={`${sx}-${sz}`} position={[sx * 0.92, 1.06, sz * 0.92]}>
          <cylinderGeometry args={[0.1, 0.1, 1.5, 12]} />
          <meshStandardMaterial color="#2a3442" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      {/* Lime status strip on the front lip and an accent beacon on a top corner. */}
      <mesh position={[0, 1.74, 1.0]}>
        <boxGeometry args={[0.9, 0.08, 0.05]} />
        <meshBasicMaterial color="#91f45f" toneMapped={false} />
      </mesh>
      <group position={[0.72, 2.32, 0.72]}>
        <mesh><cylinderGeometry args={[0.1, 0.12, 0.12, 18]} /><meshStandardMaterial color="#252c35" metalness={0.55} roughness={0.38} /></mesh>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.09, 0.09, 0.2, 18]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

/** Rarity accent tints, mirrored from src/lib/rarity.ts so a baked crate matches
 *  the colour the game gives that rarity everywhere else. */
export const CRATE_RARITY_ACCENTS: Record<string, string> = {
  common: '#b0b0b0',
  uncommon: '#4dd94d',
  rare: '#4d80ff',
  epic: '#b34dff',
  legendary: '#ffd900',
  mythic: '#ff3333',
  divine: '#ffffff',
};
