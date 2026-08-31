# Import every exported Evergreen model into the running Blender scene.
#
# Runs inside Blender, sent over the BlenderMCP addon's socket on :9876. Pair it
# with `npm run dev` + /dev/export, which is what puts the .glb files in tmp/glb
# in the first place — nothing in this repo ships a mesh, the models are three.js
# code and the exporter bakes them.
#
# Laid out on a grid with one empty per model as a parent, so a model is one
# click to select and one G to move, and re-running does not pile a second copy
# on top of the first: anything previously imported is cleared by collection.

import bpy
import os
from mathutils import Vector

COLLECTION = "Evergreen"
GLB_DIR = os.environ.get("EVERGREEN_GLB_DIR", "")
PER_ROW = 7
# Gap between cells. The cell itself is measured, not assumed — see place().
MARGIN = 2.0


def clear_previous():
    """Remove a prior import, so this script is safe to run twice."""
    existing = bpy.data.collections.get(COLLECTION)
    if existing:
        for obj in list(existing.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for child in list(existing.children):
            bpy.data.collections.remove(child)
        bpy.data.collections.remove(existing)

    # Deleting the objects orphans their meshes and materials but does not free
    # them, and the glTF importer names materials positionally — so a second run
    # produces Material_0.001, a third Material_0.002, and by the tenth the file
    # is carrying nine dead copies of every material in the game. Sweep until it
    # stops finding anything, because freeing a mesh can orphan its material.
    for _ in range(4):
        orphans = [
            block
            for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images)
            for block in collection
            if block.users == 0
        ]
        if not orphans:
            break
        for block in orphans:
            if isinstance(block, bpy.types.Mesh):
                bpy.data.meshes.remove(block)
            elif isinstance(block, bpy.types.Material):
                bpy.data.materials.remove(block)
            else:
                bpy.data.images.remove(block)


def footprint(objects):
    """The XY extent of some objects in world space, as (width, depth)."""
    xs, ys = [], []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
    if not xs:
        return (0.0, 0.0)
    return (max(xs) - min(xs), max(ys) - min(ys))


def main():
    if not GLB_DIR or not os.path.isdir(GLB_DIR):
        return {"error": "EVERGREEN_GLB_DIR is not a directory: %r" % GLB_DIR}

    files = sorted(f for f in os.listdir(GLB_DIR) if f.lower().endswith(".glb"))
    if not files:
        return {"error": "no .glb files in %s" % GLB_DIR}

    clear_previous()
    root = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(root)

    imported = []
    failed = []
    placed = []

    for filename in files:
        name = os.path.splitext(filename)[0]
        # Track what the import adds by diffing the object set: the GLTF importer
        # returns nothing useful and selection state is not reliable when the
        # file contains several meshes.
        before = set(bpy.data.objects)
        try:
            bpy.ops.import_scene.gltf(filepath=os.path.join(GLB_DIR, filename))
        except Exception as exc:  # noqa: BLE001 - one bad file must not stop the run
            failed.append({"name": name, "error": str(exc)})
            continue

        new_objects = [o for o in bpy.data.objects if o not in before]
        if not new_objects:
            failed.append({"name": name, "error": "importer produced no objects"})
            continue

        group = bpy.data.collections.new(name)
        root.children.link(group)

        anchor = bpy.data.objects.new(name, None)
        anchor.empty_display_type = "PLAIN_AXES"
        anchor.empty_display_size = 0.6
        group.objects.link(anchor)

        mesh_count = 0
        for obj in new_objects:
            for coll in list(obj.users_collection):
                coll.objects.unlink(obj)
            group.objects.link(obj)
            # Only reparent the roots. The importer's own hierarchy below them is
            # already correct, and re-parenting a child would move it twice.
            if obj.parent is None:
                obj.parent = anchor
            if obj.type == "MESH":
                mesh_count += 1

        # The glTF importer names materials by position — Material_0, Material_1
        # — so every one of the thirty-eight files contributes its own Material_0
        # and Blender disambiguates them into Material_0.001..037. That is
        # unusable for the thing this import is FOR: opening a model and changing
        # its surfaces. Rename them after the model that owns them.
        renamed = set()
        for obj in new_objects:
            for slot in obj.material_slots:
                mat = slot.material
                if mat is None or mat.name in renamed:
                    continue
                renamed.add(mat.name)
                mat.name = "%s_%d" % (name, len(renamed) - 1)

        # Reparenting invalidates the world matrices, and bound_box is read
        # through them. Measuring without this gives the pre-parent transform,
        # which is right only by luck and only while the anchor sits at origin.
        bpy.context.view_layer.update()
        width, depth = footprint(new_objects)
        placed.append(anchor)
        imported.append(
            {
                "name": name,
                "objects": len(new_objects),
                "meshes": mesh_count,
                "size": [round(width, 2), round(depth, 2)],
            }
        )

    # Lay out only once everything is measured. A guessed constant spacing put
    # the settlement building — eight metres across — straight through its
    # neighbours, and the models here range from a four-vertex floor decal to a
    # whole building, so there is no constant that suits both.
    cell = max([max(m["size"]) for m in imported] or [1.0]) + MARGIN
    for index, anchor in enumerate(placed):
        anchor.location = ((index % PER_ROW) * cell, -(index // PER_ROW) * cell, 0.0)

    return {
        "cell": round(cell, 2),
        "collection": COLLECTION,
        "imported": len(imported),
        "failed": failed,
        "models": imported,
    }


RESULT = main()
print("EVERGREEN_IMPORT_RESULT", RESULT)
