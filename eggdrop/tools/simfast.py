"""Fast (numba) version of the air-strut drop simulation.
Vent profile is a table: open vent area (m^2, geometric) vs chamber height y (m)."""
import numpy as np
from numba import njit

G = 9.81; P0 = 101325.0; RHO0 = 1.204; GAM = 1.4
CRIT = (2 / (GAM + 1)) ** (GAM / (GAM - 1))

@njit(cache=True)
def _mdot(Ae, pu, ru, pd):
    pr = pd / pu
    if pr < CRIT:
        pr = CRIT
    if pr > 1.0:
        pr = 1.0
    f = 2 * GAM / (GAM - 1) * (pr ** (2 / GAM) - pr ** ((GAM + 1) / GAM))
    if f < 0:
        f = 0.0
    return Ae * np.sqrt(pu * ru * f)

@njit(cache=True)
def _deriv(st, prm, ygrid, agrid, out):
    xf, vf, s, vs, xe, ve, ma = st[0], st[1], st[2], st[3], st[4], st[5], st[6]
    A, y0, Vd, mf, mb, me, Cd, Al, kg, cg, ke, ce, fric, Pf = prm[0], prm[1], prm[2], prm[3], prm[4], prm[5], prm[6], prm[7], prm[8], prm[9], prm[10], prm[11], prm[12], prm[13]
    y = y0 - s
    V = A * y + Vd
    if V < 1e-7:
        V = 1e-7
    rho = ma / V
    pc = P0 * (rho / RHO0) ** GAM
    Aopen = Cd * np.interp(y, ygrid, agrid) + Al
    if pc > P0:
        dma = -_mdot(Aopen, pc, rho, P0)
    else:
        dma = _mdot(Aopen, P0, RHO0, pc)
    Fair = (pc - P0) * A
    Fg = 0.0
    if xf < 0:
        Fg = -kg * xf - cg * vf
        if Fg < 0:
            Fg = 0.0
    kst = 2e7
    Fst = 0.0
    if s < 0:
        Fst += -kst * s - 200 * vs
    if y < 0:
        Fst -= kst * (-y) + 200 * vs
    # sliding friction proportional to air force (side loads), opposes relative motion
    Ff = 0.0
    if vs > 1e-4:
        Ff = -fric * abs(Fair)
    elif vs < -1e-4:
        Ff = fric * abs(Fair)
    # landing base (cap) touching the ground: base height = xf + Pf - s
    Fb = 0.0
    hb = xf + Pf - s
    if hb < 0:
        vb_ = vf - vs
        Fb = -2e7 * hb - 2.0 * np.sqrt(2e7 * mb) * 0.35 * vb_
        if Fb < 0:
            Fb = 0.0
    Fe = -ke * xe - ce * ve
    af = (-mf * G - Fair + Fg + Fst + Ff) / mf
    ab = (-mb * G + Fair - Fst - Ff - Fe + Fb) / mb
    ae = -G + Fe / me
    out[0] = vf; out[1] = af; out[2] = vs; out[3] = af - ab
    out[4] = ve; out[5] = ae - ab; out[6] = dma
    return ab, ae, pc

@njit(cache=True)
def run(h, prm, ygrid, agrid, vfac, dt, t_end):
    st = np.zeros(7)
    v0 = -np.sqrt(2 * G * h) * vfac
    st[1] = v0
    st[6] = RHO0 * (prm[0] * prm[1] + prm[2])
    k1 = np.zeros(7); k2 = np.zeros(7); k3 = np.zeros(7); k4 = np.zeros(7); tmp = np.zeros(7)
    pb = 0.0; pe = 0.0; smax = 0.0; pmax = 0.0; ymin = 1.0
    n = int(t_end / dt)
    for i in range(n):
        ab, ae, pc = _deriv(st, prm, ygrid, agrid, k1)
        for j in range(7): tmp[j] = st[j] + 0.5 * dt * k1[j]
        _deriv(tmp, prm, ygrid, agrid, k2)
        for j in range(7): tmp[j] = st[j] + 0.5 * dt * k2[j]
        _deriv(tmp, prm, ygrid, agrid, k3)
        for j in range(7): tmp[j] = st[j] + dt * k3[j]
        _deriv(tmp, prm, ygrid, agrid, k4)
        for j in range(7): st[j] += dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])
        g_b = ab / G + 1; g_e = ae / G + 1
        if g_b > pb: pb = g_b
        if g_e > pe: pe = g_e
        if st[2] > smax: smax = st[2]
        if pc > pmax: pmax = pc
        y = prm[1] - st[2]
        if y < ymin: ymin = y
    vb = st[1] - st[3]
    return pb, pe, smax, pmax, ymin, vb, st[1]

def params(A, y0, Vdead, m_foot, m_body, m_egg, Cd, A_leak, k_ground=5e6, e_ground=0.5,
           k_egg=3e4, zeta_egg=0.3, fric=0.0, P_foot=10.0):
    e = e_ground
    cg = -2 * np.log(e) / np.sqrt(np.pi ** 2 + np.log(e) ** 2) * np.sqrt(k_ground * m_foot)
    ce = 2 * zeta_egg * np.sqrt(k_egg * m_egg)
    return np.array([A, y0, Vdead, m_foot, m_body, m_egg, Cd, A_leak, k_ground, cg, k_egg, ce, fric, P_foot], float)

@njit(cache=True)
def run_hist(h, prm, ygrid, agrid, vfac, dt, t_end, every):
    st = np.zeros(7)
    st[1] = -np.sqrt(2 * G * h) * vfac
    st[6] = RHO0 * (prm[0] * prm[1] + prm[2])
    k1 = np.zeros(7); k2 = np.zeros(7); k3 = np.zeros(7); k4 = np.zeros(7); tmp = np.zeros(7)
    n = int(t_end / dt)
    H = np.zeros((n // every + 1, 7))
    for i in range(n):
        ab, ae, pc = _deriv(st, prm, ygrid, agrid, k1)
        if i % every == 0:
            r = i // every
            H[r, 0] = i * dt; H[r, 1] = ab / G + 1; H[r, 2] = ae / G + 1; H[r, 3] = st[2]
            H[r, 4] = (pc - P0) / 1000; H[r, 5] = st[0]; H[r, 6] = st[1] - st[3]
        for j in range(7): tmp[j] = st[j] + 0.5 * dt * k1[j]
        _deriv(tmp, prm, ygrid, agrid, k2)
        for j in range(7): tmp[j] = st[j] + 0.5 * dt * k2[j]
        _deriv(tmp, prm, ygrid, agrid, k3)
        for j in range(7): tmp[j] = st[j] + dt * k3[j]
        _deriv(tmp, prm, ygrid, agrid, k4)
        for j in range(7): st[j] += dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])
    return H
