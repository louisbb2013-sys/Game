"""Step-by-step assembly pictures for GRIP BRAKE."""
import os, sys, numpy as np, trimesh, manifold3d as m3
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly, FancyArrowPatch
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
sys.path.insert(0, os.path.dirname(__file__))
import parts as P
OUT = os.path.join(os.path.dirname(__file__), '..', 'assembly')
C = dict(tube='#cfd6de', pod='#3b4252', lid='#4c566a', ring='#ff3b30', egg='#f5deb3', cotton='#ffffff', stick='#b07d48')

def tm(man):
    m = man.to_mesh(); return trimesh.Trimesh(np.array(m.vert_properties)[:, :3], np.array(m.tri_verts), process=False)

POD, POD_TOP = P.pod(); LID, LID_H = P.lid(); TUBE, Z_TOP = P.tube(POD_TOP)
RING_FREE = P.ring()
STEP = P.GROOVE_W + P.CHAMF + P.FLANGE_H
SLOT_Z = [P.FLANGE_H + P.CL + k * STEP for k in range(3)]
LID_UP = 1.6                                     # lid top above pod rim
REST_Z = Z_TOP - POD_TOP - LID_UP                # pod bottom when lid top is level with rim

def ring_in_bore():
    ro, ri = P.R_BORE, P.R_BORE - P.RING_T
    band = m3.CrossSection.circle(ro, 120) - m3.CrossSection.circle(ri, 120)
    band = band - m3.CrossSection.square((P.GAP_IN_BORE, 20), True).translate((0, ro))
    return m3.Manifold.extrude(band, P.RING_H)

def lid_use(z_pod):
    return LID.rotate((180, 0, 0)).translate((0, 0, z_pod + POD_TOP + LID_UP))

def egg_mesh(zc):
    e = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    v = e.vertices.copy(); v[:, 0] *= 22; v[:, 1] *= 22; v[:, 2] *= 28.5
    v[:, 0] *= 1 + 0.12 * v[:, 2] / 28.5; v[:, 1] *= 1 + 0.12 * v[:, 2] / 28.5
    e.vertices = v + [0, 0, zc]; return e

def render3d(items, path, title, xlim, ylim, zlim, elev=18, azim=-60, arrows=(), notes=(), size=(6, 7)):
    fig = plt.figure(figsize=size, dpi=140); ax = fig.add_subplot(111, projection='3d')
    L = np.array([0.4, -0.7, 0.6]); L /= np.linalg.norm(L)
    tris, cols = [], []
    for mesh, col in items:
        mesh = tm(mesh) if not isinstance(mesh, trimesh.Trimesh) else mesh
        base = np.array(matplotlib.colors.to_rgb(col)); sh = 0.35 + 0.65 * np.clip(mesh.face_normals @ L, 0, 1)
        tris.append(mesh.triangles); cols.append(np.clip(base * sh[:, None], 0, 1))
    ax.add_collection3d(Poly3DCollection(np.concatenate(tris), facecolors=np.concatenate(cols), edgecolors='none'))
    for (x, y, z, dx, dy, dz) in arrows:
        ax.quiver(x, y, z, dx, dy, dz, color='#0a84ff', linewidth=3, arrow_length_ratio=0.25)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.set_zlim(*zlim)
    ax.set_box_aspect((xlim[1] - xlim[0], ylim[1] - ylim[0], zlim[1] - zlim[0]))
    ax.view_init(elev=elev, azim=azim); ax.axis('off')
    fig.suptitle(title, fontsize=12, fontweight='bold', y=0.97)
    for i, n in enumerate(notes):
        fig.text(0.05, 0.08 - i * 0.035, n, fontsize=9)
    fig.savefig(path, bbox_inches='tight', facecolor='white'); plt.close(fig)

def section(items, path, title, xlim, ylim, extra=None, notes=(), size=(6, 7)):
    fig, ax = plt.subplots(figsize=size, dpi=140)
    for mesh, col in items:
        mesh = tm(mesh) if not isinstance(mesh, trimesh.Trimesh) else mesh
        sec = mesh.section(plane_origin=(0, 0, 0), plane_normal=(0, 1, 0))
        if sec is None: continue
        p2, T = sec.to_2D(normal=(0, 1, 0))
        for poly in p2.polygons_full:
            xy = np.array(poly.exterior.coords); v = trimesh.transform_points(np.c_[xy, np.zeros(len(xy))], T)
            ax.add_patch(MPoly(np.c_[v[:, 0], v[:, 2]], closed=True, fc=col, ec='#111', lw=0.5, zorder=2))
            for h in poly.interiors:
                h = np.array(h.coords); h3 = trimesh.transform_points(np.c_[h, np.zeros(len(h))], T)
                ax.add_patch(MPoly(np.c_[h3[:, 0], h3[:, 2]], closed=True, fc='white', ec='#111', lw=0.5, zorder=2))
    if extra: extra(ax)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title(title, fontsize=12, fontweight='bold')
    for i, n in enumerate(notes):
        fig.text(0.05, 0.06 - i * 0.03, n, fontsize=9)
    fig.savefig(path, bbox_inches='tight', facecolor='white'); plt.close(fig)

def draw_egg_cotton(ax, z_pod, cotton=True):
    if cotton:
        cav = [(-P.R_CAV + .4, z_pod + P.POD_FLOOR + .4), (P.R_CAV - .4, z_pod + P.POD_FLOOR + .4),
               (P.R_CAV - .4, z_pod + POD_TOP - .4), (-P.R_CAV + .4, z_pod + POD_TOP - .4)]
        ax.add_patch(MPoly(cav, closed=True, fc='#f7f4ea', ec='none', hatch='....', zorder=1))
    t = np.linspace(0, 2 * np.pi, 200); zc = z_pod + P.POD_FLOOR + 36
    ax.add_patch(MPoly(np.c_[22 * np.sin(t) * (1 + .12 * np.cos(t)), zc - 28.5 * np.cos(t)], closed=True, fc=C['egg'], ec='#8a6d3b', lw=1, zorder=3))

def arrow(ax, x0, y0, x1, y1, txt=None, tx=None, ty=None):
    ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle='-|>', mutation_scale=18, color='#0a84ff', lw=2.5, zorder=5))
    if txt: ax.text(tx if tx is not None else x1 + 4, ty if ty is not None else (y0 + y1) / 2, txt, fontsize=9, color='#0a84ff', va='center', zorder=6)

def main():
    os.makedirs(OUT, exist_ok=True)
    # 1 - parts
    items = [(TUBE.translate((-60, 40, 0)), C['tube']), (POD.translate((40, 40, 0)), C['pod']),
             (LID.translate((130, 40, 0)), C['lid']), (RING_FREE.translate((40, -60, 0)), C['ring']),
             (RING_FREE.translate((130, -60, 0)), C['ring']), (egg_mesh(28.5).apply_translation((-60, -70, 0)), C['egg'])]
    for k in range(6):
        b = trimesh.creation.icosphere(subdivisions=1, radius=8).apply_translation((-125 + 20 * k, -100, 8))
        items.append((b, C['cotton']))
    render3d(items, os.path.join(OUT, 'step1_parts.png'), '1. Parts: tube, egg pod, lid, 2 brake rings', (-140, 175), (-115, 90), (0, 170), elev=25,
             notes=['Tube  |  Egg pod  |  Lid (shown top-down, as printed)  |  2 red brake rings  |  egg + 20 cotton balls'], size=(8, 6))
    # 2 - rings on pod
    items = [(POD, C['pod']), (RING_FREE.translate((0, 0, SLOT_Z[0])), C['ring']),
             (RING_FREE.rotate((0, 0, 180)).translate((0, 0, SLOT_Z[1] + 45)), C['ring'])]
    render3d(items, os.path.join(OUT, 'step2_rings.png'), '2. Snap the rings into the BOTTOM and MIDDLE slots', (-60, 60), (-60, 60), (0, 130),
             arrows=[(0, -50, SLOT_Z[1] + 45, 0, 0, -35)],
             notes=['Open a ring a little at its gap and slide it down until it drops into the slot.',
                    'Top slot stays empty (only for a 3rd ring).  Put the two gaps on opposite sides.'])
    # 3 - egg + cotton + lid
    def ex3(ax):
        draw_egg_cotton(ax, 0)
        arrow(ax, 0, POD_TOP + 45, 0, POD_TOP + 22, 'screw lid on (clockwise)', 38, POD_TOP + 34)
        for txt, z, w in (('6 cotton balls under', 6, 'normal'), ('6 around the egg', 30, 'normal'), ('egg: POINTY END DOWN', 44, 'bold'), ('4 on top', 66, 'normal')):
            ax.annotate(txt, xy=(20, z), xytext=(44, z), fontsize=9, fontweight=w, va='center', arrowprops=dict(arrowstyle='-', lw=0.6, color='#333'))
    items = [(POD, C['pod']), (RING_FREE.translate((0, 0, SLOT_Z[0])), C['ring']), (RING_FREE.translate((0, 0, SLOT_Z[1])), C['ring']),
             (LID.rotate((180, 0, 0)).translate((0, 0, POD_TOP + LID_UP + 25)), C['lid'])]
    section(items, os.path.join(OUT, 'step3_egg.png'), '3. Pack the egg, screw the lid on tight', (-45, 120), (-5, POD_TOP + 50), ex3,
            notes=['Shake it: the egg must not move. Cotton goes ONLY in the pod.'])
    # 4 - push into tube
    lifted = Z_TOP + 20
    items = [(TUBE, C['tube']), (POD.translate((0, 0, lifted)), C['pod']), (lid_use(lifted), C['lid'])]
    for k in range(2):
        items.append((ring_in_bore().translate((0, 0, lifted + SLOT_Z[k])), C['ring']))
    render3d(items, os.path.join(OUT, 'step4_insert.png'), '4. Push the pod into the tube, bottom first', (-60, 60), (-60, 60), (0, lifted + 95),
             arrows=[(0, 0, lifted + 110, 0, 0, -28)], elev=12,
             notes=['Stand the tube on the floor. Push on the lid with both hands (it is stiff - lean on it).',
                    'Stop when the LID TOP IS LEVEL WITH THE TUBE RIM. That is the start position.'], size=(6, 8))
    # 5 - start position + after test drop
    def ex5(ax):
        ax.plot([-80, 80], [0, 0], color='#555', lw=3)
        ax.plot([P.R_OUT + 3, P.R_OUT + 22], [Z_TOP, Z_TOP], color='#0a84ff', lw=1, ls='--')
        ax.plot([P.R_OUT + 3, P.R_OUT + 22], [Z_TOP - 14, Z_TOP - 14], color='#0a84ff', lw=1, ls='--')
        ax.annotate('', xy=(P.R_OUT + 16, Z_TOP - 14), xytext=(P.R_OUT + 16, Z_TOP), arrowprops=dict(arrowstyle='<->', color='#0a84ff', lw=1.5))
        ax.text(P.R_OUT + 24, Z_TOP - 7, 'slide\n(measure)', fontsize=9, color='#0a84ff', va='center')
        draw_egg_cotton(ax, REST_Z - 14)
    items = [(TUBE, C['tube']), (POD.translate((0, 0, REST_Z - 14)), C['pod']), (lid_use(REST_Z - 14), C['lid'])]
    for k in range(2):
        items.append((ring_in_bore().translate((0, 0, REST_Z - 14 + SLOT_Z[k])), C['ring']))
    section(items, os.path.join(OUT, 'step5_test.png'), '5. Test drop from 4 ft, then measure', (-50, 120), (-8, Z_TOP + 12), ex5,
            notes=['Hold the TUBE (not the lid), base down, and let go.', 'Slide 10-16 mm = good.  17 mm or more = add the 3rd ring in the top slot.'])
    # 6 - reset with broom handle
    def ex6(ax):
        ax.plot([-80, 80], [-30, -30], color='#555', lw=3)
        ax.add_patch(MPoly([(-12, -30), (12, -30), (12, REST_Z - 30), (-12, REST_Z - 30)], closed=True, fc=C['stick'], ec='#5a3d1e', zorder=1.5))
        ax.text(16, 20, 'broom handle', fontsize=9, rotation=90, va='bottom')
        arrow(ax, -55, Z_TOP - 10, -55, Z_TOP - 45, 'press the tube DOWN', -110, Z_TOP - 28)
        draw_egg_cotton(ax, REST_Z - 30)
    items = [(TUBE.translate((0, 0, -30)), C['tube']), (POD.translate((0, 0, REST_Z - 30)), C['pod']), (lid_use(REST_Z - 30), C['lid'])]
    for k in range(2):
        items.append((ring_in_bore().translate((0, 0, REST_Z - 30 + SLOT_Z[k])), C['ring']))
    section(items, os.path.join(OUT, 'step6_reset.png'), '6. Reset / take the egg out', (-115, 80), (-35, Z_TOP + 12), ex6,
            notes=['Put the stick through the hole in the base and press the tube down.', 'Push until the lid sticks out to open it, or until it is level with the rim to drop again.'])
    import matplotlib.image as mpimg
    fig, axs = plt.subplots(2, 3, figsize=(18, 14), dpi=110)
    for ax, n in zip(axs.flat, ['step1_parts', 'step2_rings', 'step3_egg', 'step4_insert', 'step5_test', 'step6_reset']):
        ax.imshow(mpimg.imread(os.path.join(OUT, n + '.png'))); ax.axis('off')
    fig.suptitle('GRIP BRAKE - assembly', fontsize=20, fontweight='bold')
    fig.tight_layout(); fig.savefig(os.path.join(OUT, 'GRIP_BRAKE_assembly_sheet.png'), facecolor='white'); plt.close(fig)
    print('done')

if __name__ == '__main__':
    main()
