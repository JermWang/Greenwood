"""
Lay the GPU game's file-based 3D models out as a Blender project, grouped by name.

WHAT THIS DOES
    Imports every crate GLB from public/models/crates/ and puts each one in its
    own named Collection (crate_common, crate_uncommon, ...), spaced in a row in
    rarity order and sat on the floor, so the whole set is visible at once and
    each model is easy to isolate, hide, or edit on its own.

WHAT IT DOES NOT DO
    The six fab machines (Lithography Machine, Wafer Stack, Dicing Saw,
    Packaging Line, EUV Utility Core, AI Accelerator Test Rack) are NOT here.
    They are procedural react-three-fiber code, not files — they only become
    geometry when the app renders them, so there is nothing on disk to import.
    Getting them into Blender is a separate export step (see the repo notes).

HOW TO RUN
    1. Open Blender (4.x).
    2. Scripting tab -> Open -> pick this file (or paste it into a new text block).
    3. Press Run Script (or Alt-P).
    If Blender cannot find the models, edit CRATES_DIR below to the absolute path
    of public/models/crates on this machine.

    Nothing here is destructive by default: it adds collections to whatever scene
    is open. Set CLEAR_SCENE = True to start from an empty scene instead.
"""

import bpy
import os
from mathutils import Vector

# --- configuration ----------------------------------------------------------

# Crates in rarity order, which is the order they are laid out left to right.
CRATE_ORDER = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythic",
    "divine",
]

# Gap between models, added on top of each model's own width so nothing overlaps
# regardless of scale.
SPACING_GAP = 0.6

# Start from a clean scene (removes the default cube/camera/light). Off by
# default so running this never throws away work you already have open.
CLEAR_SCENE = False

# Resolve the crates directory. When the script is run from a saved file this
# derives it from the file location; otherwise it falls back to the constant,
# which you can edit to match this machine.
def resolve_crates_dir():
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        candidate = os.path.normpath(os.path.join(here, "..", "public", "models", "crates"))
        if os.path.isdir(candidate):
            return candidate
    except NameError:
        pass
    return r"C:\Users\jerms\Desktop\CODING\WEB 3\GPU\public\models\crates"


CRATES_DIR = resolve_crates_dir()


# --- helpers -----------------------------------------------------------------

def clear_scene():
    """Remove every object from the current scene."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def named_collection(name):
    """Get or create a top-level collection with this name."""
    existing = bpy.data.collections.get(name)
    if existing:
        return existing
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def move_to_collection(obj, collection):
    """Detach an object from every collection it is in, then link it to one."""
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)


def world_bounds(objs):
    """Combined world-space min/max corners of a set of objects."""
    mins = Vector((float("inf"),) * 3)
    maxs = Vector((float("-inf"),) * 3)
    for obj in objs:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins = Vector(map(min, mins, world))
            maxs = Vector(map(max, maxs, world))
    return mins, maxs


# --- import ------------------------------------------------------------------

def main():
    if not os.path.isdir(CRATES_DIR):
        raise RuntimeError(
            "Could not find the crates directory at:\n  %s\n"
            "Edit CRATES_DIR at the top of this script to the absolute path of "
            "public/models/crates on this machine." % CRATES_DIR
        )

    if CLEAR_SCENE:
        clear_scene()

    cursor_x = 0.0
    placed = 0

    for rarity in CRATE_ORDER:
        path = os.path.join(CRATES_DIR, "crate_%s.glb" % rarity)
        if not os.path.isfile(path):
            print("skip: %s not found" % path)
            continue

        # Import. Whatever it brings in is left selected, which is how we know
        # which objects belong to this crate.
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        imported = [o for o in bpy.data.objects if o not in before]
        if not imported:
            print("skip: %s imported nothing" % path)
            continue

        name = "crate_%s" % rarity
        col = named_collection(name)
        for obj in imported:
            move_to_collection(obj, col)

        # Only the roots of this import get moved. A GLB comes in as a hierarchy
        # (an empty parent with mesh children), and a child's world position is
        # its parent's times its own — so shifting every object's location would
        # move the children twice and blow the group apart. Moving just the
        # unparented roots carries their children along exactly once.
        imported_set = set(imported)
        roots = [o for o in imported if o.parent not in imported_set]

        # Sit the group on the floor (z = 0) and line them up along x by their
        # actual width, so differently sized crates still get clean gaps.
        mins, maxs = world_bounds(imported)
        width = maxs.x - mins.x
        offset_x = cursor_x - mins.x
        offset_z = -mins.z
        for obj in roots:
            obj.location.x += offset_x
            obj.location.z += offset_z

        cursor_x += width + SPACING_GAP
        placed += 1
        print("placed %-16s (%d object%s)" % (name, len(imported), "" if len(imported) == 1 else "s"))

    # Frame everything so the whole row is visible the moment the script ends.
    if placed:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                for region in area.regions:
                    if region.type == "WINDOW":
                        override = {"area": area, "region": region}
                        bpy.ops.object.select_all(action="SELECT")
                        with bpy.context.temp_override(**override):
                            bpy.ops.view3d.view_selected()
                        break

    print("\nDone. %d crate collection(s) laid out along +X, grouped by name." % placed)


main()

# When run headless with --background -- <output.blend>, save the result so the
# import can be produced into a .blend file without opening the GUI. Interactive
# runs (no such arg) skip this and just leave the collections in the open scene.
if bpy.app.background:
    import sys
    argv = sys.argv
    if "--" in argv and len(argv) > argv.index("--") + 1:
        out = argv[argv.index("--") + 1]
        # Strip the factory-startup cube/camera/light so the delivered file holds
        # only the crate collections and nothing else.
        for junk in ("Cube", "Camera", "Light"):
            obj = bpy.data.objects.get(junk)
            if obj:
                bpy.data.objects.remove(obj, do_unlink=True)
        default = bpy.data.collections.get("Collection")
        if default and not default.objects:
            bpy.data.collections.remove(default)
        bpy.ops.wm.save_as_mainfile(filepath=out)
        print("saved:", out)
