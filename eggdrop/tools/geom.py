"""Geometry helpers (manifold3d): revolve profiles, twisted-extrusion threads."""
import numpy as np
import manifold3d as m3

SEG = 160  # facets per full circle


def revolve(pts, seg=SEG):
    """pts: list of (r, z) polygon (counter-clockwise in r-z), r >= 0."""
    cs = m3.CrossSection([np.array(pts, float)], m3.FillRule.EvenOdd)
    return m3.Manifold.revolve(cs, seg)


def cyl(r, h, z0=0.0, seg=SEG):
    return m3.Manifold.cylinder(h, r, r, seg).translate((0, 0, z0))


def box(x0, x1, y0, y1, z0, z1):
    return m3.Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def thread_profile(u, p, r_root, depth, crest_frac=0.25, root_frac=0.25):
    """Radius of an external trapezoid thread at axial phase u (mm, any real)."""
    u = np.mod(u, p)
    wc, wr = crest_frac * p, root_frac * p
    wf = (p - wc - wr) / 2
    r = np.empty_like(u)
    a = u < wr
    r[a] = r_root
    b = (u >= wr) & (u < wr + wf)
    r[b] = r_root + depth * (u[b] - wr) / wf
    c = (u >= wr + wf) & (u < wr + wf + wc)
    r[c] = r_root + depth
    d = u >= wr + wf + wc
    r[d] = r_root + depth * (1 - (u[d] - wr - wf - wc) / wf)
    return r


def thread_solid(p, r_root, depth, h, z0=0.0, clearance=0.0, n_ang=240, div_per_turn=48):
    """Right-hand threaded solid of revolution (the 'bolt').  With clearance>0
    the profile is grown by `clearance` radially and axially: use it as the cutter
    for the matching nut."""
    th = np.linspace(0, 2 * np.pi, n_ang, endpoint=False)
    u = -th / (2 * np.pi) * p          # phase at z=0 for each angle (RH thread)
    if clearance > 0:
        k = np.linspace(-clearance, clearance, 13)
        r = np.max([thread_profile(u + dk, p, r_root, depth) for dk in k], axis=0) + clearance
    else:
        r = thread_profile(u, p, r_root, depth)
    poly = np.c_[r * np.cos(th), r * np.sin(th)]
    cs = m3.CrossSection([poly])
    turns = h / p
    return m3.Manifold.extrude(cs, h, int(np.ceil(turns * div_per_turn)), 360.0 * turns).translate((0, 0, z0))


def diamond_hole_x(cx_axis_len, side, z, ang, r_in, r_out):
    """Radial diamond (square rotated 45 deg, vertex up) hole through a tube wall
    at height z and azimuth ang (rad).  side = square side (mm)."""
    s = side
    sq = m3.CrossSection.square((s, s), True).rotate(45)
    pr = m3.Manifold.extrude(sq, r_out - r_in + 2).translate((0, 0, r_in - 1))
    # prism along +z; rotate so its axis is radial (x), cross-section in y-z
    pr = pr.rotate((0, 90, 0))
    return pr.rotate((0, 0, np.degrees(ang))).translate((0, 0, z))
