"""Preview images: 3D assembly view + labelled cut-away section."""
import numpy as np, trimesh, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from matplotlib.patches import Ellipse, Polygon as MPoly
sys.path.insert(0, os.path.dirname(__file__))
import parts as P

D = os.path.join(os.path.dirname(__file__), '..', 'stl')
OUT = os.path.join(os.path.dirname(__file__), '..')
Z_CAP = P.P_FOOT
Z_BODY = Z_CAP + P.DISC_T
Z_HEAD = Z_BODY + P.ZB_HEAD0
Z_LID = Z_BODY + P.ZB_RIM - P.NECK_H


def load(name):
    return trimesh.load(os.path.join(D, name), process=False)


def placed():
    bar = load('4_foot_bar.stl'); v = bar.vertices.copy(); L = v[:, 0].max()
    bar.vertices = np.c_[v[:, 2] - 10.0, v[:, 1], L - v[:, 0]]
    bar.invert()  # mirror fix (handedness)
    head = load('3_piston_head.stl'); v = head.vertices.copy()
    head.vertices = np.c_[v[:, 0], v[:, 1], P.H_HEAD - v[:, 2] + Z_HEAD]; head.invert()
    pin = load('5_pin.stl'); v = pin.vertices.copy()
    v = np.c_[v[:, 0] - v[:, 0].max() / 2, v[:, 1], v[:, 2] - P.PIN / 2]
    c, s = np.cos(np.pi / 4), np.sin(np.pi / 4)
    pin.vertices = np.c_[v[:, 0], c * v[:, 1] - s * v[:, 2], s * v[:, 1] + c * v[:, 2] + Z_HEAD + P.PIN_Z]
    cap = load('2_base_cap.stl'); cap.apply_translation((0, 0, Z_CAP))
    body = load('1_body.stl'); v = body.vertices.copy()
    body.vertices = np.c_[v[:, 0], -v[:, 1], P.ZB_RIM - v[:, 2] + Z_BODY]   # print file is flipped (rot-x 180)
    lid = load('6_lid.stl'); lid.apply_translation((0, 0, Z_LID))
    return dict(bar=bar, head=head, pin=pin, cap=cap, body=body, lid=lid)


COL = dict(body='#d9dde3', cap='#ff7a1a', lid='#ff7a1a', head='#2b2f36', bar='#2b2f36', pin='#ffd23f')


def egg_outline(zc, n=200):
    t = np.linspace(0, 2 * np.pi, n)
    # simple egg curve: pointy end down
    a, b = 28.5, 22.0
    z = a * np.cos(t); r = b * np.sin(t) * (1 + 0.12 * np.cos(t))
    return np.c_[r, zc - z]


def section_view(path):
    pts = placed()
    fig, ax = plt.subplots(figsize=(6.2, 11), dpi=150)
    ax.set_facecolor('white')
    for k in ['body', 'cap', 'lid', 'head', 'bar', 'pin']:
        m = pts[k]
        sec = m.section(plane_origin=(0, 0, 0), plane_normal=(0, 1, 0))
        if sec is None:
            continue
        p2, T = sec.to_2D(normal=(0, 1, 0))
        # map back: we want x horizontal, z vertical
        for poly in p2.polygons_full:
            xy = np.array(poly.exterior.coords)
            v3 = trimesh.transform_points(np.c_[xy, np.zeros(len(xy))], T)
            ax.add_patch(MPoly(np.c_[v3[:, 0], v3[:, 2]], closed=True, fc=COL[k], ec='#111', lw=0.4))
            for hole in poly.interiors:
                h = np.array(hole.coords)
                h3 = trimesh.transform_points(np.c_[h, np.zeros(len(h))], T)
                ax.add_patch(MPoly(np.c_[h3[:, 0], h3[:, 2]], closed=True, fc='white', ec='#111', lw=0.4))
    # cotton + egg
    zc_egg = Z_BODY + P.ZB_APEX + 34
    cav_r = P.R_CAV
    cot = [(-cav_r + 1, Z_BODY + P.ZB_APEX + cav_r), (0, Z_BODY + P.ZB_APEX + 1), (cav_r - 1, Z_BODY + P.ZB_APEX + cav_r),
           (cav_r - 1, Z_LID + P.NECK_H + 4), (0, Z_LID + P.NECK_H + 4 + cav_r - 1), (-cav_r + 1, Z_LID + P.NECK_H + 4)]
    ax.add_patch(MPoly(cot, closed=True, fc='#f4f1e6', ec='none', hatch='....', zorder=0.5))
    e = egg_outline(zc_egg)
    ax.add_patch(MPoly(e, closed=True, fc='#fff3d6', ec='#8a6d3b', lw=1.0, zorder=3))
    ax.plot([-80, 80], [0, 0], color='#555', lw=3)
    ax.text(0, -12, 'concrete', ha='center', va='top', fontsize=8, color='#555')
    lab = [
        ('LID (twist on)', 55, Z_LID + 40, 40, Z_LID + 40),
        ('Egg in 20 cotton balls', 60, zc_egg, 18, zc_egg),
        ('Egg pod (part of body)', 60, Z_BODY + P.ZB_APEX + 20, 37, Z_BODY + P.ZB_APEX + 20),
        ('Air chamber', 60, Z_BODY + P.ZB_CEIL - 70, 20, Z_BODY + P.ZB_CEIL - 70),
        ('Metering vent holes', 60, Z_BODY + P.ZB_CEIL - 120, 38, Z_BODY + P.ZB_CEIL - 120),
        ('Piston head', 60, Z_HEAD + 11, 30, Z_HEAD + 11),
        ('Base cap / landing pad', 60, Z_CAP - 14, 40, Z_CAP + 2),
        ('Foot bar (strut)', 40, 90, 10, 90),
        ('Ball nose hits first', 30, 18, 6, 6),
    ]
    for t, tx, ty, px, py in lab:
        ax.annotate(t, xy=(px, py), xytext=(tx + 22, ty), fontsize=8, va='center',
                    arrowprops=dict(arrowstyle='-', color='#333', lw=0.6))
    ax.set_xlim(-70, 170); ax.set_ylim(-25, Z_LID + 75)
    ax.set_aspect('equal'); ax.axis('off')
    ax.set_title('AIR STRUT - cut-away (extended, ready to drop)', fontsize=10)
    fig.savefig(path, bbox_inches='tight'); plt.close(fig)


def view3d(path, cut=False):
    pts = placed()
    fig = plt.figure(figsize=(6, 10), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    light = np.array([0.4, -0.7, 0.6]); light /= np.linalg.norm(light)
    for k, m in pts.items():
        tri = m.triangles; nrm = m.face_normals
        if cut:
            keep = tri[:, :, 1].mean(axis=1) < 0
            tri, nrm = tri[keep], nrm[keep]
        base = np.array(matplotlib.colors.to_rgb(COL[k]))
        shade = 0.35 + 0.65 * np.clip(nrm @ light, 0, 1)
        cols = np.clip(base[None, :] * shade[:, None], 0, 1)
        pc = Poly3DCollection(tri, facecolors=cols, edgecolors='none', linewidths=0)
        ax.add_collection3d(pc)
    ax.set_xlim(-130, 130); ax.set_ylim(-130, 130); ax.set_zlim(0, 500)
    ax.set_box_aspect((260, 260, 500))
    ax.view_init(elev=12, azim=-60)
    ax.axis('off')
    fig.savefig(path, bbox_inches='tight', transparent=False, facecolor='white'); plt.close(fig)


if __name__ == '__main__':
    section_view(os.path.join(OUT, 'preview_section.png'))
    print('section ok')
    view3d(os.path.join(OUT, 'preview_3d.png'))
    print('3d ok')
