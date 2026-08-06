'use client';

// The isometric canvas: a fixed-angle orthographic camera you pan and zoom but
// never rotate.
//
// Locking rotation is the point of the format. It means every model only has to
// read from one angle, shadows always fall the same way, and a tile's screen
// position is stable — which is what makes click-to-place feel exact instead of
// approximate, the way it did under the old free-orbit perspective camera.

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import IsoBoard, { BOARD_BOUNDS, type BoardBounds, type DragState } from './IsoBoard';
import { type CharacterLook } from './Character';
import { type DeskLivery } from './DeskModels';
import { ISO, ISO_OFFSET, ZOOM, type IsoMachine, type PlacedIsoMachine } from './palette';
import { renderTier } from './render-tier';

const OFFSET = new THREE.Vector3(...ISO_OFFSET);
/** Ground-plane basis for this camera angle: screen-right and screen-away. */
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const AWAY = new THREE.Vector3(-1, 0, -1).normalize();
/** Pointer travel (px) above which a gesture is a camera pan, not a click. */
const DRAG_SLOP = 6;

/**
 * Module-level so the object identity never changes.
 *
 * An inline `camera={{...}}` literal is a new object on every render, which
 * makes R3F re-apply it — including the placeholder zoom — stomping the fit the
 * rig just computed. That is why the board rendered off-screen until you
 * scrolled: the fit was being overwritten a frame after it was set.
 */
const CAMERA = { position: ISO_OFFSET, zoom: ZOOM.initial, near: -400, far: 600 } as const;

export function IsoRig({
  dragRef,
  interactive,
  bounds,
  zoom,
  follow,
  followRef,
  minZoom,
}: {
  dragRef: React.MutableRefObject<DragState>;
  interactive: boolean;
  bounds: BoardBounds;
  zoom?: number;
  /**
   * A point the camera returns to whenever the player is not dragging.
   *
   * Rooms leave this off — you see the whole floor at once, so there is nothing
   * to follow. A WORLD needs it: the map is far larger than the viewport, and a
   * camera parked wherever you last dragged it means walking off the edge of
   * your own view.
   *
   * Following is a PULL, not a lock. While a drag is in progress the camera is
   * yours, and the existing damp glides it back on release rather than snapping,
   * so looking around never fights you and never jars on the way back.
   */
  follow?: { x: number; z: number } | null;
  /**
   * The character's LIVE position, as a ref written every frame.
   *
   * Prefer this over `follow` for anything that walks, and the difference is the
   * whole feel of movement.
   *
   * `follow` is React state, and the only thing that updates it is `onStep` —
   * which fires when a WAYPOINT is reached. So the camera was not following the
   * character at all: it was being told, a few times per walk, where the
   * character had just finished arriving, and gliding there after the fact.
   * Path smoothing made that far worse rather than better, because collapsing a
   * staircase into three long legs means three camera updates across a walk that
   * used to have thirty. The result reads as the camera catching up at the end
   * instead of travelling with you.
   *
   * A ref fixes it without a re-render per frame, which is the reason not to
   * just push position into state at 60Hz: this scene re-renders on every
   * position change, and the camera does not need React to know anything.
   */
  followRef?: React.MutableRefObject<{ x: number; z: number } | null>;
  /**
   * How far out the player may zoom.
   *
   * ZOOM.min exists so a 25x33 room can be seen whole on a phone, and applying
   * that to an outdoor region lets you pull back until the map is a small
   * diamond adrift in empty ground — the region reads as mostly nothing, which
   * is exactly the impression the Grounds were shrunk to avoid. A region that
   * knows how big it is should say how far out is useful.
   */
  minZoom?: number;
}) {
  const { camera, gl, size } = useThree();
  /**
   * Aimed slightly above the floor on purpose.
   *
   * The room's visual mass sits above the ground plane — walls, beams, hanging
   * signs all stack upward — so aiming at the ground centre pushed the room
   * against the top of the canvas and left a band of dead space along the
   * bottom. Raising the look-at point moves the whole scene down into it.
   */
  const centre = useMemo(
    () => new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0.5, (bounds.minZ + bounds.maxZ) / 2),
    [bounds]
  );
  const target = useRef(centre.clone());
  const desired = useRef(centre.clone());

  // Frame the whole board on mount and on resize.
  //
  // A fixed starting zoom cannot work here: the same constant that frames the
  // dashboard's 9x9 twin drops you inside a single tile of the 25x33 floor.
  // Rotating 45 degrees makes a spanX by spanZ board project to roughly
  // (spanX + spanZ) * cos45 wide and half that tall, which is what this solves.
  useEffect(() => {
    // A first layout pass can report a zero-sized canvas; fitting to that would
    // divide the board into nothing.
    if (!size.width || !size.height) return;
    const cam = camera as THREE.OrthographicCamera;
    if (zoom != null) {
      cam.zoom = zoom;
    } else {
      // A ground rectangle projects to a rhombus whose screen size depends only
      // on (spanX + spanZ) — width (span)/√2, height (span)·0.4082 — so the
      // projected shape is always about 1.73:1 whatever proportions the room
      // has. On a ~2:1 canvas that means the fit is ALWAYS height-limited and
      // some width is always spare. Reshaping the room cannot recover it; the
      // only levers are the two padding terms below, so they are kept tight.
      //
      // `headroom` buys space for everything standing above the ground plane.
      // The tallest thing is the far wall and its beam at 4.7 units, projecting
      // to 4.7·cos(35.26°) ≈ 3.8 of screen height. Set it below that and the
      // near corner of the plinth is chopped off by the bottom edge — which
      // reads as a broken viewport rather than as a room continuing past it.
      //
      // 3.0 plus what the span padding already contributes lands the room at
      // very nearly the full canvas height, which is as large as it can be:
      // height is the binding constraint and no amount of reshaping changes it.
      const span = (bounds.maxX - bounds.minX + 2) + (bounds.maxZ - bounds.minZ + 2);
      const screenW = span * 0.7071;
      const screenH = span * 0.4082 + 3.0;
      const fit = Math.min(size.width / screenW, size.height / screenH);
      cam.zoom = THREE.MathUtils.clamp(fit, ZOOM.min, ZOOM.max);
    }
    cam.updateProjectionMatrix();
    desired.current.copy(centre);
    target.current.copy(centre);
  }, [camera, bounds, zoom, size.width, size.height, centre]);

  /** Zoom-out limit: the region's own, or the global room minimum. */
  const floor = minZoom ?? ZOOM.min;

  /**
   * Pan and zoom, by mouse and by touch.
   *
   * TOUCH WAS NOT SUPPORTED AND IT WAS NOT OBVIOUS, because pointer events made
   * it look like it was. A one-finger drag already panned — touch fires
   * pointerdown/move/up like a mouse — so the camera felt fine and nothing
   * announced that ZOOM was wheel-only. On a phone there is no wheel, which
   * meant no player on a phone could zoom any scene in this game, in or out,
   * ever. Every region uses this rig, so it was every region.
   *
   * Pointers are tracked in a Map rather than as one x/y pair. With a single
   * pair, a second finger overwrites `lastX/lastY` and the next move computes a
   * delta between two DIFFERENT fingers — the camera jumps the distance between
   * them, which reads as the map teleporting whenever a second thumb lands.
   *
   * One pointer pans. Two pinch: the midpoint pans and the distance zooms, so a
   * pinch that also drifts does both, which is what a hand actually does.
   */
  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;

    /** Live pointers by id. Size decides the gesture. */
    const points = new Map<number, { x: number; y: number }>();
    /** Distance and midpoint of the last two-finger frame. */
    let lastSpread = 0;
    let lastMidX = 0;
    let lastMidY = 0;

    const cam = () => camera as THREE.OrthographicCamera;
    const pan = (dx: number, dy: number) => {
      const k = 2 / cam().zoom;
      // Grab-and-pull, on both axes: the ground follows the pointer, so the
      // camera moves opposite to the drag. Horizontally that was already the
      // case; vertically it was reversed, which is why dragging down walked the
      // view further down the floor instead of pulling the floor toward you.
      desired.current.addScaledVector(RIGHT, -dx * k);
      desired.current.addScaledVector(AWAY, dy * k);
    };
    const zoomBy = (factor: number) => {
      const c = cam();
      c.zoom = THREE.MathUtils.clamp(c.zoom * factor, floor, ZOOM.max);
      c.updateProjectionMatrix();
    };

    /** Distance and midpoint of the two active touches. */
    const spread = () => {
      const [a, b] = [...points.values()];
      return {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
    };

    const onDown = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragRef.current.dragging = true;
      // Reset here rather than on pointerup: the board's click handler runs
      // immediately after up and needs to still see how far this gesture moved.
      if (points.size === 1) dragRef.current.moved = 0;
      if (points.size === 2) {
        const s = spread();
        lastSpread = s.d;
        lastMidX = s.mx;
        lastMidY = s.my;
        // A pinch is never a tap. Push past the slop so releasing it cannot be
        // read as a click on whatever tile happened to be under a finger.
        dragRef.current.moved = DRAG_SLOP + 1;
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = points.get(e.pointerId);
      if (!prev) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (points.size >= 2) {
        const s = spread();
        if (lastSpread > 0) {
          zoomBy(s.d / lastSpread);
          // The midpoint carries the pan, so a pinch that slides also travels.
          pan(s.mx - lastMidX, s.my - lastMidY);
        }
        lastSpread = s.d;
        lastMidX = s.mx;
        lastMidY = s.my;
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
      if (dragRef.current.moved <= DRAG_SLOP) return;
      pan(dx, dy);
      el.style.cursor = 'grabbing';
    };

    const onUp = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (points.size < 2) lastSpread = 0;
      // Lifting one finger of a pinch leaves the other one panning. Re-seat it
      // so the survivor does not pan by the gap between the two.
      if (points.size === 0) {
        dragRef.current.dragging = false;
        el.style.cursor = '';
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(1 - e.deltaY * 0.0012);
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // A touch that leaves the surface without a clean up (dragged off the
    // element, interrupted by a system gesture) fires cancel instead. Without
    // this the pointer stays in the map forever and the next single touch is
    // treated as the second half of a pinch that never ended.
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl, dragRef, interactive, floor]);

  useFrame((_, delta) => {
    // Re-aim at the followed point unless the player is actively looking around.
    // Written to the DESIRED position rather than straight to the target, so it
    // goes through the same damping a drag does — the return is a glide, not a
    // cut.
    //
    // The live ref wins when there is one. It is sampled every frame, so the
    // camera travels WITH the character for the whole walk; `follow` is the
    // waypoint-rate fallback for callers that have no live position to give.
    const aim = followRef?.current ?? follow;
    if (aim && !dragRef.current.dragging) {
      desired.current.x = aim.x;
      desired.current.z = aim.z;
    }
    target.current.x = THREE.MathUtils.damp(target.current.x, desired.current.x, 12, delta);
    target.current.z = THREE.MathUtils.damp(target.current.z, desired.current.z, 12, delta);
    camera.position.copy(target.current).add(OFFSET);
    camera.lookAt(target.current);
  });

  return null;
}

export function Lighting({ bounds }: { bounds: BoardBounds }) {
  const shadowCamera = useMemo(() => {
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    return span * 0.75 + 6;
  }, [bounds]);
  // Half the map edge on a phone: the same shadow camera over a quarter of the
  // texels, which softens edges rather than removing them. Kept ON — see
  // render-tier for why the shadows are not the thing worth cutting.
  const shadowMapSize = useMemo(() => renderTier().shadowMapSize, []);

  // Ordinary daylight: a warm key, a cool sky, a neutral fill. Nothing here is
  // tinted toward the brand colour — a green key light was what made every
  // material in the scene read as green regardless of what colour it actually was.
  return (
    <>
      <ambientLight color="#ffffff" intensity={0.55} />
      <hemisphereLight color="#cfe0ee" groundColor="#6d6154" intensity={0.85} />
      <directionalLight
        color="#fff4e2"
        intensity={2.0}
        position={[16, 24, 10]}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-shadowCamera}
        shadow-camera-right={shadowCamera}
        shadow-camera-top={shadowCamera}
        shadow-camera-bottom={-shadowCamera}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0012}
      />
      {/* Cool bounce from the opposite side keeps unlit faces off flat black —
          important when every surface is flat-shaded. Neutral blue, like sky
          fill in a real room, not the brand colour. */}
      <directionalLight color="#9fbcd6" intensity={0.5} position={[-14, 9, -12]} />
    </>
  );
}

export interface IsoSceneProps {
  machines: IsoMachine[];
  layout: PlacedIsoMachine[];
  holdingId: string | null;
  selectedId: string | null;
  onTileClick: (x: number, z: number) => void;
  onDeskClick: (id: string) => void;
  /** Forwarded to IsoBoard: the tile the player is standing on. */
  onPlayerMove?: (cell: { x: number; z: number }) => void;
  onBackgroundClick?: () => void;
  /** Compact boards (the dashboard twin) pass their own extent and framing. */
  bounds?: BoardBounds;
  zoom?: number;
  /** Showcase boards (the landing hero) turn off pan/zoom so the page still scrolls. */
  interactive?: boolean;
  /** Build the Machine Room shell around the board. Only the real floor wants it. */
  dressed?: boolean;
  /** The player standing in the room, for boards you can walk around. */
  avatar?: { look: CharacterLook; name?: string } | null;
  /** Desk and plinth cosmetics, applied to every desk on this floor. */
  livery?: DeskLivery;
  /**
   * Anything else that belongs in this room's 3D scene.
   *
   * Rendered inside the Canvas, which is the only reason this exists: the room
   * owns its own Canvas, so a caller cannot put a mesh in it from outside. The
   * Machine Room needs it for the residents standing on the floor — they are
   * scene content, not a board concern, and threading them through IsoBoard
   * would make the board know about people it does not otherwise care about.
   */
  children?: React.ReactNode;
}

export default function IsoScene({
  bounds = BOARD_BOUNDS,
  zoom,
  interactive = true,
  dressed = false,
  avatar = null,
  livery,
  children,
  ...props
}: IsoSceneProps) {
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  // Read once per mount. See render-tier: a module-level constant would be
  // computed during the server render, where there is no window to ask.
  const tier = useMemo(() => renderTier(), []);

  return (
    <Canvas
      shadows
      dpr={tier.dpr}
      orthographic
      camera={CAMERA}
      gl={{
        antialias: tier.antialias,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.06,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      onPointerMissed={() => {
        if (dragRef.current.moved > DRAG_SLOP) return;
        props.onBackgroundClick?.();
      }}
    >
      <color attach="background" args={[ISO.void]} />
      <fog attach="fog" args={[ISO.void, 80, 165]} />
      <Lighting bounds={bounds} />
      <IsoRig dragRef={dragRef} interactive={interactive} bounds={bounds} zoom={zoom} />
      <IsoBoard
        {...props}
        bounds={bounds}
        dressed={dressed}
        avatar={avatar}
        livery={livery}
        dragRef={dragRef}
      />
      {children}
    </Canvas>
  );
}
