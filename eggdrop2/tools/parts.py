"""GRIP BRAKE egg capsule - printable parts.  Units mm, z = up in use.
Friction-brake capsule: the egg pod carries C-shaped spring rings that press
outward on the tube wall; on impact the pod slides down the tube and friction
turns the egg's energy into heat (like an elevator safety brake)."""
import os, sys
import numpy as np, manifold3d as m3, trimesh
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'eggdrop', 'tools'))
from geom import revolve, cyl, thread_solid, SEG

OUT = os.path.join(os.path.dirname(__file__), '..', 'stl')
CL = 0.3
# ---- tube (housing) ----
R_BORE = 35.0            # 70 mm bore: brake surface
WALL = 1.6
R_OUT = R_BORE + WALL
BASE_T = 3.2
R_HOLE = 21.0            # 42 mm hole in the base (reset push + air vent)
STROKE = 90.0
# ---- brake ring ----
RING_T = 6.0             # radial thickness
RING_H = 15.0
RING_N = 240.0           # design radial force per ring (N) -> sets the free size
E_PLA = 3200.0
GAP_IN_BORE = 3.0        # gap left when squeezed into the bore
# ---- pod ----
R_CAV = 27.0             # 54 mm egg cavity
R_GROOVE = R_BORE - RING_T - CL     # groove floor (28.7)
R_FLANGE = 31.6
FLANGE_H = 1.6
POD_FLOOR = 2.0
P_TH, D_TH = 3.0, 1.4
POD_TH_ROOT = R_GROOVE
POD_TH_H = 12.0
GROOVE_W = RING_H + 2 * CL
CHAMF = R_FLANGE - R_GROOVE          # 45deg underside of each flange


def export(man, name):
    m = man.to_mesh()
    tm = trimesh.Trimesh(np.array(m.vert_properties)[:, :3], np.array(m.tri_verts), process=False)
    tm.export(os.path.join(OUT, name))
    return tm


def ring_free_geometry():
    """Free (printed) ring so that squeezed into the bore it pushes RING_N outward."""
    R_m = R_BORE - RING_T / 2
    I = RING_H * RING_T ** 3 / 12
    p = RING_N / (2 * np.pi * R_BORE)
    dg = 3 * np.pi * p * R_m ** 4 / (E_PLA * I)          # extra gap closure in the bore
    sigma = 12 * p * R_m ** 2 / (RING_H * RING_T ** 2)
    R_free = R_m + dg / (2 * np.pi)
    return R_m, R_free, dg, sigma


def ring():
    R_m, R_free, dg, sigma = ring_free_geometry()
    ro, ri = R_free + RING_T / 2, R_free - RING_T / 2
    band = m3.CrossSection.circle(ro, SEG) - m3.CrossSection.circle(ri, SEG)
    gap = GAP_IN_BORE + dg                                  # chord of the free gap
    cut = m3.CrossSection.square((gap, RING_T * 3), True).translate((0, ro))
    band = band - cut
    r = m3.Manifold.extrude(band, RING_H)
    # 0.6 mm chamfers on the outer edges so the ring slides over layer lines
    r = r - revolve([(ro - 0.6, RING_H + 0.01), (ro + 2, RING_H + 0.01), (ro + 2, RING_H - 2.6)])
    r = r - revolve([(ro - 0.6, -0.01), (ro + 2, -0.01), (ro + 2, 2.6)])
    return r


def pod_profile():
    """Outer profile (r, z) of the pod body, bottom to top."""
    pts = [(0, 0), (R_FLANGE - 0.5, 0), (R_FLANGE, 0.5), (R_FLANGE, FLANGE_H), (R_GROOVE, FLANGE_H)]
    z = FLANGE_H
    for k in range(3):
        z += GROOVE_W                       # ring slot
        pts += [(R_GROOVE, z), (R_FLANGE, z + CHAMF), (R_FLANGE, z + CHAMF + FLANGE_H)]
        z += CHAMF + FLANGE_H
        pts += [(R_GROOVE, z)] if k < 2 else [(POD_TH_ROOT, z)]
    z_th = z
    z_top = z_th + POD_TH_H
    pts += [(POD_TH_ROOT, z_top - 0.6), (POD_TH_ROOT - 0.6, z_top), (R_CAV, z_top), (R_CAV, POD_FLOOR), (0, POD_FLOOR)]
    return pts, z_th, z_top


def pod():
    pts, z_th, z_top = pod_profile()
    b = revolve(pts)
    th = thread_solid(P_TH, POD_TH_ROOT - 0.3, D_TH + 0.3, POD_TH_H - 1.0, z0=z_th + 0.3)
    th = th - revolve([(POD_TH_ROOT - 1, z_top + 0.01), (POD_TH_ROOT + D_TH + 1, z_top + 0.01), (POD_TH_ROOT + D_TH + 1, z_top - D_TH - 2)])
    b = b + (th - cyl(R_CAV, 200, -1))
    return b, z_top


LID_R = POD_TH_ROOT + D_TH + CL + 2.2   # must stay inside the bore


def lid():
    """Screw cap for the pod. z=0 is the top face (printed top-down)."""
    H = POD_TH_H + 2.2
    outer = revolve([(0, 0), (LID_R - 1.0, 0), (LID_R, 1.0), (LID_R, H), (0, H)])
    nut = thread_solid(P_TH, POD_TH_ROOT, D_TH, POD_TH_H + 1.0, z0=2.2, clearance=CL)
    lead = revolve([(POD_TH_ROOT - 1, H + 0.01), (POD_TH_ROOT + D_TH + 1.5, H + 0.01), (POD_TH_ROOT - 1, H - 2.5)])
    l = outer - nut - lead - cyl(POD_TH_ROOT + CL, POD_TH_H + 2, 2.2)
    # two finger grips (shallow slots across the top)
    for a in (0, 90):
        s = m3.Manifold.cube((2 * LID_R + 2, 6, 0.8)).translate((-LID_R - 1, -3, -0.01)).rotate((0, 0, a))
        l = l - s
    return l, H


def tube(pod_len):
    """Housing tube with landing base. z=0 = ground face."""
    z_top = BASE_T + STROKE + pod_len
    top_band = 12.0
    funnel = 10.0
    outer = [(R_HOLE, 0), (R_OUT + 1.0 - 1.0, 0), (R_OUT + 1.0, 1.0), (R_OUT + 1.0, BASE_T), (R_OUT, BASE_T + 1.0),
             (R_OUT, z_top - top_band - 1.6), (R_OUT + 1.6, z_top - top_band), (R_OUT + 1.6, z_top - 0.8),
             (R_OUT + 0.8, z_top), (R_BORE + 2.2, z_top), (R_BORE, z_top - funnel), (R_BORE, BASE_T),
             (R_HOLE + 1.0, BASE_T), (R_HOLE, BASE_T - 1.0)]
    return revolve(outer), z_top


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    R_m, R_free, dg, sigma = ring_free_geometry()
    print(f"ring: mean R {R_m:.2f} -> free {R_free:.2f}, extra gap closure {dg:.1f} mm, stress {sigma:.1f} MPa")
    p, pod_len = pod()
    l, lid_h = lid()
    t, z_top = tube(pod_len)
    parts = {'1_tube.stl': t, '2_egg_pod.stl': p, '3_pod_lid.stl': l, '4_brake_ring.stl': ring()}
    for n, m in parts.items():
        tm = export(m, n)
        print(n, 'watertight', tm.is_watertight, 'vol cm3', round(tm.volume / 1000, 1), 'size', np.round(tm.extents, 1).tolist())
    print('pod length', pod_len, 'tube height', z_top)
