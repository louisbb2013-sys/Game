"""AIR STRUT egg capsule - all printable parts.  Units mm.  z = up in use.
Run: python3 parts.py  -> writes ../stl/*.stl"""
import numpy as np, manifold3d as m3, trimesh, json, sys, os
from geom import revolve, cyl, box, thread_solid, diamond_hole_x, SEG

CL = 0.3                      # fit clearance (per side)
# ---- strut / chamber ----
R_BORE = 36.0                 # bore radius (72 mm bore)
R_HEAD = R_BORE - CL          # piston head radius
H_HEAD = 22.0
S_STROKE = 150.0
C_CUSH = 25.0
Y0 = S_STROKE + C_CUSH        # chamber height when extended (175)
WALL = 2.2                    # strut wall
R_OUT = R_BORE + WALL
BAR = 20.0                    # foot bar section (square)
BAR_R = 2.5                   # bar corner radius
SOCKET = 17.0                 # bar depth inside head
PIN = 5.6                     # square pin side
PIN_Z = 8.5                   # pin centre above head bottom
# ---- base cap ----
DISC_T = 3.5
R_DISC = 48.0
HUB_H = 12.0                  # hub above disc (bar guide total = DISC_T + HUB_H)
R_HUB = 17.0
# ---- threads ----
P_TH = 4.0; D_TH = 1.5
BOT_TH_ROOT = R_BORE + 2.2    # body bottom external thread root radius
BOT_TH_H = 14.0
# ---- egg pod ----
R_CAV = R_BORE                # egg cavity radius (72 mm)
CONE = R_CAV                  # 45 deg cone height
FLOOR = 4.0                   # chamber ceiling to cone apex
CYL_POD = 16.0                # cylindrical part of pod cavity
NECK_ROOT = R_CAV + 2.2       # lid thread root radius on the body
NECK_H = 16.0
# ---- vertical layout (body local: zb=0 at body bottom rim) ----
ZB_HEAD0 = HUB_H              # head bottom when extended (rests on hub)
ZB_CEIL = ZB_HEAD0 + H_HEAD + Y0
ZB_APEX = ZB_CEIL + FLOOR
ZB_RIM = ZB_APEX + CONE + CYL_POD
P_FOOT = 168.0                # nose below base when extended

VENTS = []                    # list of (y_below_ceiling_mm, side_mm, count)


def export(man, name):
    m = man.to_mesh()
    v = np.array(m.vert_properties)[:, :3]
    f = np.array(m.tri_verts)
    tm = trimesh.Trimesh(v, f, process=False)
    path = os.path.join(os.path.dirname(__file__), '..', 'stl', name)
    tm.export(path)
    return tm


def chamfer_ring(r, z, c, up=True):
    """Solid triangle ring used to cut a 45deg chamfer at outer edge (r,z)."""
    if up:
        pts = [(r - c, z + 0.01), (r + 1, z + 0.01), (r + 1, z - c - 1)]
    else:
        pts = [(r - c, z - 0.01), (r + 1, z + c + 1), (r + 1, z - 0.01)]
    return revolve(pts)


# ------------------------------------------------------------------ FOOT
def head():
    """Piston head (cup).  z=0 at its bottom, face on top.  Printed face-down."""
    FACE, SKIRT, BOSS_W = 2.4, 2.4, 3.0
    h = cyl(R_HEAD, H_HEAD)
    h = h - cyl(R_HEAD - SKIRT, H_HEAD - FACE + 0.01, -0.01)
    sb = BAR + 2 * CL + 2 * BOSS_W
    boss = m3.Manifold.extrude(m3.CrossSection([rounded_square(sb, 3.0)]), H_HEAD - 0.5)
    h = h + boss
    # labyrinth grooves near the top: 1.2 tall, 0.8 deep
    for zt in (1.5, 4.0, 6.5):
        z1 = H_HEAD - zt
        h = h - revolve([(R_HEAD - 0.8, z1 - 1.2), (R_HEAD + 1, z1 - 1.2), (R_HEAD + 1, z1), (R_HEAD - 0.8, z1)])
    h = h - revolve([(R_HEAD - 0.6, H_HEAD + 0.01), (R_HEAD + 1, H_HEAD + 0.01), (R_HEAD + 1, H_HEAD - 1.6)])
    h = h - revolve([(R_HEAD - 0.6, -0.01), (R_HEAD + 1, -0.01), (R_HEAD + 1, 1.6)])
    s = BAR + 2 * CL
    sock = m3.Manifold.extrude(m3.CrossSection([rounded_square(s, BAR_R + CL)]), SOCKET).translate((0, 0, -0.01))
    h = h - sock
    ps = PIN + 0.4
    sq = m3.CrossSection.square((ps, ps), True).rotate(45)
    pin = m3.Manifold.extrude(sq, 2 * R_HEAD + 4).translate((0, 0, -R_HEAD - 2))
    pin = pin.rotate((0, 90, 0)).translate((0, 0, PIN_Z))
    return h - pin


def rounded_square(s, r, n=12):
    pts = []
    for cx, cy, a0 in ((s/2 - r, s/2 - r, 0), (-s/2 + r, s/2 - r, 90), (-s/2 + r, -s/2 + r, 180), (s/2 - r, -s/2 + r, 270)):
        for a in np.linspace(a0, a0 + 90, n):
            pts.append((cx + r * np.cos(np.radians(a)), cy + r * np.sin(np.radians(a))))
    return np.array(pts)


def bar():
    """Foot bar, printed lying flat.  Built along +x: x=0 is the TOP end (inside
    the head), x=L is the nose.  Section 20x20 (y,z), z in [0,20] on the bed."""
    L = SOCKET + HUB_H + DISC_T + P_FOOT          # top of bar to nose tip
    sec = rounded_square(BAR, BAR_R)
    b = m3.Manifold.extrude(m3.CrossSection([sec]), L)        # along z
    b = b.rotate((0, 90, 0))                                   # now along +x? check sign
    bb = b.bounding_box()
    b = b.translate((-bb[0], 0, -bb[2]))                       # x from 0..L, z from 0..20
    # ball nose: intersect last part with sphere R=14 centred on axis
    Rn = 14.0
    sph = m3.Manifold.sphere(Rn, SEG).translate((L - Rn, 0, BAR / 2))
    keep = box(-1, L - Rn, -20, 20, -1, 30) + sph
    b = b ^ keep
    # pin hole (vertical in print), centred 8.5 below bar top -> x = SOCKET - PIN_Z
    ps = PIN + 0.4
    sq = m3.CrossSection.square((ps, ps), True).rotate(45)
    hole = m3.Manifold.extrude(sq, 30).translate((SOCKET - PIN_Z, 0, -5))
    b = b - hole
    # small chamfer at the top end edges is not needed (hidden in socket)
    return b, L


def pin():
    L = 2 * R_HEAD - 0.6
    p = box(0, L, -PIN / 2, PIN / 2, 0, PIN)
    # chamfer the ends slightly for easy insertion
    return p



# ------------------------------------------------------------------ BASE CAP
R_CAP_RING = BOT_TH_ROOT + D_TH + CL + 2.6     # outer radius of thread ring


def base_cap():
    """Landing base + bar guide + nut for the body bottom thread.  z=0 = ground face."""
    disc = revolve([(0, 0), (R_DISC - 2.0, 0), (R_DISC, 2.0), (R_DISC, DISC_T - 1.0),
                    (R_DISC - 1.0, DISC_T), (0, DISC_T)])
    ring = revolve([(BOT_TH_ROOT - 0.5, DISC_T - 0.01), (R_CAP_RING, DISC_T - 0.01),
                    (R_CAP_RING, DISC_T + BOT_TH_H - 1.0), (R_CAP_RING - 1.0, DISC_T + BOT_TH_H),
                    (BOT_TH_ROOT - 0.5, DISC_T + BOT_TH_H)])
    # 45deg fillet ring between disc and ring outside (stiffens, prints fine)
    gus = revolve([(R_CAP_RING - 0.01, DISC_T - 0.01), (R_CAP_RING + 5.0, DISC_T - 0.01), (R_CAP_RING - 0.01, DISC_T + 5.0)])
    nut = thread_solid(P_TH, BOT_TH_ROOT, D_TH, BOT_TH_H + 2, z0=DISC_T - 1, clearance=CL)
    # lead-in chamfer at the top of the nut
    lead = revolve([(BOT_TH_ROOT - 1, DISC_T + BOT_TH_H + 0.01), (BOT_TH_ROOT + D_TH + 1.5, DISC_T + BOT_TH_H + 0.01),
                    (BOT_TH_ROOT - 1, DISC_T + BOT_TH_H - 2.5)])
    cap = disc + (ring + gus - nut - lead)
    hub = cyl(R_HUB, HUB_H, DISC_T - 0.01)
    cap = cap + hub
    # bar guide hole (square, rounded) through disc + hub
    g = BAR + 2 * CL
    hole = m3.Manifold.extrude(m3.CrossSection([rounded_square(g, BAR_R + CL)]), 40).translate((0, 0, -5))
    cap = cap - hole
    # 45deg lead-in at bottom of guide (so bar end slides in)
    cap = cap - revolve([(0, -0.01), (g / 2 + 1.2, -0.01), (0, g / 2 + 1.2)]) if False else cap
    # breather windows: 4 sector windows between hub and r = 33 (inside the body bore)
    win = None
    for k in range(4):
        a0 = np.radians(k * 90 + 12); a1 = np.radians(k * 90 + 78)
        aa = np.linspace(a0, a1, 24)
        r0, r1 = R_HUB + 1.5, R_BORE - 3.5
        pts = [(r1 * np.cos(a), r1 * np.sin(a)) for a in aa] + [(r0 * np.cos(a), r0 * np.sin(a)) for a in aa[::-1]]
        w = m3.Manifold.extrude(m3.CrossSection([np.array(pts)]), DISC_T + 2).translate((0, 0, -1))
        win = w if win is None else win + w
    cap = cap - win
    return cap


# ------------------------------------------------------------------ LID
LID_TH_H = NECK_H
R_LID_OUT = NECK_ROOT + D_TH + CL + 2.4


def lid():
    """Lid with internal thread, 45deg inner roof, dome and grip knob. z=0 = rim (print rim down)."""
    zc = 4.0                                   # short cylinder above the neck top
    z_th_top = LID_TH_H
    # inner cavity profile (in lid coords): neck top (body rim) at z = LID_TH_H
    zr = z_th_top + zc                          # start of inner 45deg roof
    zk = zr - 2.7 + (R_LID_OUT - 10.0)        # where the 45deg outer cone meets the knob
    outer = [(0, 0), (R_LID_OUT - 1.0, 0), (R_LID_OUT, 1.0), (R_LID_OUT, zr - 2.7),
             (10.0, zk), (10.0, zk + 9.0), (8.5, zk + 10.5), (0, zk + 10.5)]
    body = revolve(outer)
    rc = R_CAV + 1.2                           # leaves a 1.3 mm seat ledge for the body rim
    cav = revolve([(0, -1), (rc, -1), (rc, zr), (0, zr + rc)])
    nut = thread_solid(P_TH, NECK_ROOT, D_TH, LID_TH_H + 1.0, z0=-0.5, clearance=CL)
    lead = revolve([(NECK_ROOT - 1, -0.01), (NECK_ROOT + D_TH + 1.5, -0.01), (NECK_ROOT - 1, 2.5)])
    # thread relief above the thread end so the lid seats on the shoulder
    top = LID_TH_H + 0.5
    relief = revolve([(NECK_ROOT, top - 0.1), (NECK_ROOT + D_TH + 0.9, top - 0.1), (NECK_ROOT, top + D_TH + 0.8)])
    return body - cav - nut - lead - relief


# ------------------------------------------------------------------ BODY
def body(vents=None):
    """Strut sleeve + egg pod in one piece. zb=0 = bottom rim.  Printed upside down."""
    zr = ZB_RIM
    zn = zr - NECK_H                       # neck (lid thread) start
    zs = zn - (R_OUT - (NECK_ROOT + D_TH)) - 0.5   # 45deg shoulder start
    zbt = BOT_TH_H                          # bottom thread top
    outer = [(R_BORE, 0), (R_OUT, 0), (R_OUT, zr - 0.6), (R_OUT - 0.6, zr),
             (R_CAV, zr), (R_CAV, ZB_APEX + CONE), (0, ZB_APEX), (0, ZB_CEIL), (R_BORE, ZB_CEIL)]
    b = revolve(outer)
    bolt = thread_solid(P_TH, BOT_TH_ROOT - 0.01, D_TH, zbt, z0=0.0)
    # chamfer the thread start (bottom) 45deg
    bolt = bolt - revolve([(BOT_TH_ROOT - 1, -0.01), (BOT_TH_ROOT + D_TH + 1, -0.01), (BOT_TH_ROOT + D_TH + 1, D_TH + 2.0)])
    neck = thread_solid(P_TH, NECK_ROOT - 0.01, D_TH, NECK_H - 1.5, z0=zn + 0.5)
    neck = neck - revolve([(NECK_ROOT - 1, zr + 0.01), (NECK_ROOT + D_TH + 1, zr + 0.01), (NECK_ROOT + D_TH + 1, zr - D_TH - 2.5)])
    b = b + (bolt - cyl(R_BORE, zbt + 2, -1)) + (neck - cyl(R_CAV, NECK_H + 2, zn - 1))
    if vents:
        for hole in vents:
            b = b - hole
    return b

if __name__ == '__main__':
    out = {}
    hd = head()
    hd_print = hd.mirror((0, 0, 1)).translate((0, 0, H_HEAD))   # face down
    out['head'] = export(hd_print, '3_piston_head.stl')
    br, L = bar()
    out['bar'] = export(br, '4_foot_bar.stl')
    out['pin'] = export(pin(), '5_pin.stl')
    for k, t in out.items():
        print(k, 'watertight', t.is_watertight, 'vol cm3', round(t.volume / 1000, 1), 'bbox', np.round(t.bounds, 1).tolist())
    print('bar length', L)
    cap = base_cap(); out2 = {'cap': export(cap, '2_base_cap.stl')}
    out2['lid'] = export(lid(), '6_lid.stl')
    vj = json.load(open(os.path.join(os.path.dirname(__file__), 'vents_3.5.json')))
    holes = []
    GOLD = 137.508
    for i, (yc, n) in enumerate(vj['rows']):
        for j in range(n):
            ang = np.radians(i * GOLD + j * 360.0 / n)
            holes.append(diamond_hole_x(0, vj['side'], ZB_CEIL - yc, ang, R_BORE - 1, R_OUT + 1))
    bd = body(holes)
    bd_print = bd.rotate((180, 0, 0)).translate((0, 0, ZB_RIM))     # upside down: rim on the bed
    out2['body'] = export(bd_print, '1_body.stl')
    for k, t in out2.items():
        print(k, 'watertight', t.is_watertight, 'vol cm3', round(t.volume / 1000, 1), 'bbox', np.round(t.bounds, 1).tolist())
    print('ZB_CEIL', ZB_CEIL, 'ZB_APEX', ZB_APEX, 'ZB_RIM', ZB_RIM)
