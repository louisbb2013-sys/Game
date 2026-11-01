"""Preview images for GRIP BRAKE: cut-away + 3D."""
import os, sys, numpy as np, trimesh, manifold3d as m3
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
sys.path.insert(0, os.path.dirname(__file__))
import parts as P
OUT = os.path.join(os.path.dirname(__file__), '..')

def tm(man):
    m = man.to_mesh(); return trimesh.Trimesh(np.array(m.vert_properties)[:, :3], np.array(m.tri_verts), process=False)

def assembly():
    pod, pod_top = P.pod(); lid, H = P.lid(); tube, ztop = P.tube(pod_top)
    z0 = P.BASE_T + P.STROKE
    ro, ri = P.R_BORE, P.R_BORE - P.RING_T          # ring as squeezed into the bore
    band = m3.CrossSection.circle(ro, 160) - m3.CrossSection.circle(ri, 160)
    band = band - m3.CrossSection.square((P.GAP_IN_BORE, 20), True).translate((0, ro))
    ring = m3.Manifold.extrude(band, P.RING_H)
    step = P.GROOVE_W + P.CHAMF + P.FLANGE_H
    rings = [ring.translate((0, 0, z0 + P.FLANGE_H + P.CL + k * step)) for k in range(2)]
    parts = dict(tube=tube, pod=pod.translate((0, 0, z0)),
                 lid=lid.rotate((180, 0, 0)).translate((0, 0, z0 + pod_top + 2.2)),
                 ring1=rings[0], ring2=rings[1])
    return {k: tm(v) for k, v in parts.items()}, z0, pod_top, ztop

COL = dict(tube='#cfd6de', pod='#3b4252', lid='#3b4252', ring1='#ff3b30', ring2='#ff3b30')

def section(path):
    A, z0, pod_top, ztop = assembly()
    fig, ax = plt.subplots(figsize=(6, 8.5), dpi=150)
    for k, m in A.items():
        sec = m.section(plane_origin=(0, 0, 0), plane_normal=(0, 1, 0))
        if sec is None: continue
        p2, T = sec.to_2D(normal=(0, 1, 0))
        for poly in p2.polygons_full:
            xy = np.array(poly.exterior.coords); v = trimesh.transform_points(np.c_[xy, np.zeros(len(xy))], T)
            ax.add_patch(MPoly(np.c_[v[:, 0], v[:, 2]], closed=True, fc=COL[k], ec='#111', lw=0.4))
            for h in poly.interiors:
                h = np.array(h.coords); h3 = trimesh.transform_points(np.c_[h, np.zeros(len(h))], T)
                ax.add_patch(MPoly(np.c_[h3[:, 0], h3[:, 2]], closed=True, fc='white', ec='#111', lw=0.4))
    zc = z0 + P.POD_FLOOR + 36
    cot = [(-P.R_CAV + 0.5, z0 + P.POD_FLOOR + 0.5), (P.R_CAV - 0.5, z0 + P.POD_FLOOR + 0.5), (P.R_CAV - 0.5, z0 + pod_top - 0.5), (-P.R_CAV + 0.5, z0 + pod_top - 0.5)]
    ax.add_patch(MPoly(cot, closed=True, fc='#f4f1e6', ec='none', hatch='....', zorder=0.5))
    t = np.linspace(0, 2 * np.pi, 200); a, b = 28.5, 22.0
    ax.add_patch(MPoly(np.c_[b * np.sin(t) * (1 + 0.12 * np.cos(t)), zc - a * np.cos(t)], closed=True, fc='#fff3d6', ec='#8a6d3b', lw=1, zorder=3))
    ax.annotate('', xy=(-48, P.BASE_T + 2), xytext=(-48, z0), arrowprops=dict(arrowstyle='<->', color='#c00'))
    ax.text(-52, (z0 + P.BASE_T) / 2, f'{P.STROKE:.0f} mm\nbraking\ndistance', ha='right', va='center', fontsize=7, color='#c00')
    for txt, ty, px in [('Screw lid', z0 + pod_top + 1, 30), ('Egg in cotton', zc, 15), ('Brake rings (2, +1 spare slot)', z0 + 25, 34),
                        ('Egg pod (slides down)', z0 + 50, 28), ('Tube wall = brake track', 60, 35.5), ('Landing base', 2, 30)]:
        ax.annotate(txt, xy=(px, ty), xytext=(60, ty), fontsize=7.5, va='center', arrowprops=dict(arrowstyle='-', lw=0.6, color='#333'))
    ax.plot([-70, 70], [0, 0], color='#555', lw=3)
    ax.set_xlim(-85, 150); ax.set_ylim(-10, ztop + 15); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title('GRIP BRAKE - cut-away (ready to drop)', fontsize=10)
    fig.savefig(path, bbox_inches='tight'); plt.close(fig)

def view3d(path):
    A, *_ = assembly()
    fig = plt.figure(figsize=(5, 7), dpi=150); ax = fig.add_subplot(111, projection='3d')
    L = np.array([0.4, -0.7, 0.6]); L /= np.linalg.norm(L)
    for k, m in A.items():
        base = np.array(matplotlib.colors.to_rgb(COL[k])); sh = 0.35 + 0.65 * np.clip(m.face_normals @ L, 0, 1)
        ax.add_collection3d(Poly3DCollection(m.triangles, facecolors=np.clip(base * sh[:, None], 0, 1), edgecolors='none'))
    ax.set_xlim(-60, 60); ax.set_ylim(-60, 60); ax.set_zlim(0, 180); ax.set_box_aspect((120, 120, 180))
    ax.view_init(elev=14, azim=-60); ax.axis('off')
    fig.savefig(path, bbox_inches='tight', facecolor='white'); plt.close(fig)

if __name__ == '__main__':
    section(os.path.join(OUT, 'preview_section.png')); view3d(os.path.join(OUT, 'preview_3d.png')); print('ok')
