// How hard to push the GPU, decided once from the device.
//
// Every scene in this game was built with one setting: `dpr={[1, 2]}`,
// `antialias: true`, 2048² shadow maps. That is a reasonable desktop default and
// a bad phone one, and the cost is not linear — a full-screen iso scene at
// devicePixelRatio 3 (which every recent iPhone reports) renders NINE times the
// pixels of the same scene at 1, before multisampling is added on top. The
// result on a phone is a scene that runs hot, drops frames while walking, and
// drains the battery of somebody playing an IDLE game they are supposed to be
// able to leave open.
//
// WHAT IS TRADED AND WHAT IS NOT.
//
// Resolution and multisampling are traded. Shadows are NOT turned off, and that
// is deliberate: this world is lit in ordinary colour under neutral light
// (CLAUDE.md), so the shadows are doing most of the work of saying it is a
// place. A phone build without them does not look like a cheaper version of
// Evergreen, it looks like a different, flatter game. They get a smaller map
// instead — 1024² over the same shadow camera is half the texels per world
// unit, which softens the edges rather than removing them, and soft is what an
// overcast sky gives you anyway.
//
// MSAA goes entirely on mobile. Tile-based GPUs pay for it in bandwidth, which
// is exactly the budget a full-screen scene has already spent, and at a reduced
// DPR the edges it would smooth are being resampled by the browser regardless.

export interface RenderTier {
  /**
   * Rooms and boards — the Machine Room, the twin, the Trading Floor. Bounded
   * scenes with a fixed prop count. Passed straight to R3F's Canvas; a range
   * lets it settle within the band.
   */
  dpr: [number, number];
  /**
   * Outdoor regions — the Grounds, Treeline, Deep Forest, HQ.
   *
   * Lower than `dpr` on BOTH tiers, and that was already true before this
   * module existed: those pages independently chose [1, 1.75] with
   * multisampling off. They earn it — an outdoor region draws a forest of
   * instanced trees, scattered props and creatures over a map many times the
   * size of a room, so it starts from a much higher draw cost for the same
   * screen. Kept as a separate number rather than folded into one, because
   * flattening them would have silently RAISED desktop cost on exactly the
   * heaviest scenes in the game.
   */
  worldDpr: [number, number];
  antialias: boolean;
  /** Square shadow map edge, in texels. */
  shadowMapSize: number;
  /** True when this is a phone-class device, for anything else that must know. */
  mobile: boolean;
}

const DESKTOP: RenderTier = {
  dpr: [1, 2],
  worldDpr: [1, 1.75],
  antialias: true,
  shadowMapSize: 2048,
  mobile: false,
};

const MOBILE: RenderTier = {
  // Capped at 1.5 rather than 1. Flat 1 on a 3x screen makes the thin diagonal
  // edges this projection is entirely made of visibly stair-step, and an iso
  // game is a bad place to save pixels on diagonals. 1.5 keeps them readable
  // for a quarter of the fill cost of 3.
  dpr: [1, 1.5],
  worldDpr: [1, 1.25],
  antialias: false,
  shadowMapSize: 1024,
  mobile: true,
};

/**
 * Whether this is a phone-class device.
 *
 * Coarse pointer AND a narrow viewport, rather than either alone. A touchscreen
 * laptop reports a coarse pointer and has a discrete GPU; a narrow desktop
 * window is somebody dragging a browser edge and is not a reason to degrade
 * what they see. Both together is a phone or a small tablet held in the hand,
 * which is the case worth spending this on.
 *
 * `hardwareConcurrency` is the escape hatch for the device that passes both
 * checks and still cannot cope. Four cores or fewer in 2026 is a low-end phone
 * whatever its screen says.
 */
function isMobileClass(): boolean {
  // Server-rendered: assume desktop. The Canvas only ever mounts in a browser,
  // so this value is re-read there before anything is drawn.
  if (typeof window === 'undefined') return false;

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 820;
  if (coarse && narrow) return true;

  const cores = navigator.hardwareConcurrency ?? 8;
  return coarse && cores <= 4;
}

/**
 * The tier for this device.
 *
 * Read at mount rather than memoised at module scope: a module-level constant
 * would be computed during the server render, where `window` does not exist,
 * and every client would then inherit the desktop answer.
 */
export function renderTier(): RenderTier {
  return isMobileClass() ? MOBILE : DESKTOP;
}
