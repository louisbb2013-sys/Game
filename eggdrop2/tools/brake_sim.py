"""GRIP BRAKE drop model: housing hits the ground, egg pod slides down the
bore against a constant friction force F (Coulomb).  Egg rides in cotton."""
import numpy as np
from numba import njit
G = 9.81

@njit(cache=True)
def run(h, F, S, mp, mh, me, e, ke, ze, beta=0.0, dt=2e-6, T=0.15):
    kg = 3e6; cg = -2*np.log(e)/np.sqrt(np.pi**2+np.log(e)**2)*np.sqrt(kg*mh)
    ce = 2*ze*np.sqrt(ke*me)
    v0 = -np.sqrt(2*G*h)
    xh, vh, s, vs, xe, ve = 0.0, v0, 0.0, 0.0, 0.0, 0.0   # s = slide of pod down the bore
    pe = 0.0; pp = 0.0; smax = 0.0; hit = 0
    for i in range(int(T/dt)):
        Fg = 0.0
        if xh < 0:
            Fg = -kg*xh - cg*vh
            if Fg < 0: Fg = 0.0
        # friction on pod (pod velocity vp = vh - vs; vs>0 means pod moving down rel. housing)
        Ff = 0.0
        Fs_ = F*(1.0 + beta*min(max(s, 0.0), S)/S)
        if vs > 1e-5: Ff = Fs_
        elif vs < -1e-5: Ff = -Fs_
        # end stop (3 cotton balls then hard)
        Fs = 0.0
        if s > S:
            d = s - S
            Fs = 4e4*d + 3e8*d*d*d if d < 0.012 else 4e4*d + 3e8*d**3 + 5e7*(d-0.012)
        Fe = -ke*xe - ce*ve
        ap = (-mp*G + Ff + Fs - Fe)/mp
        ah = (-mh*G + Fg - Ff - Fs)/mh
        ae = -G + Fe/me
        if vs <= 1e-5 and vs >= -1e-5:
            # stuck: pod moves with housing if needed force below F
            need = mp*(ah + G) + Fe   # force to keep pod with housing
            if abs(need) <= Fs_ and s <= S:
                ap = ah; Ff = need
        vh += ah*dt; xh += vh*dt
        vs += (ah - ap)*dt; s += vs*dt
        ve += (ae - ap)*dt; xe += ve*dt
        g_e = ae/G + 1
        if g_e > pe: pe = g_e
        if (ap/G + 1) > pp: pp = ap/G + 1
        if s > smax: smax = s
    return pe, pp, smax

if __name__ == '__main__':
    import sys
    S = 0.085; mp = 0.122; mh = 0.075; me = 0.06
    for Fn in [70, 85, 100, 115]:
        print(f"--- friction {Fn} N (nominal) ---")
        for mu_f in [0.7, 1.0, 1.3]:
            row = []
            for h in [1.2, 2.4, 3.7, 6.0]:
                pe, pp, sm = run(h, Fn*mu_f, S, mp, mh, me, 0.5, 3e4, 0.3)
                row.append(f"{h}m: egg {pe:5.0f}g slide {sm*1000:4.0f}mm")
            print(f"  friction x{mu_f}: " + " | ".join(row))
