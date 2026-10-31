"""Find the vent-area profile that keeps the egg's peak g lowest across
all four drop heights and a spread of 'what if the print is a bit off' cases."""
import numpy as np, sys, time, json
from numba import njit, prange
sys.path.insert(0, '/home/user/Game/eggdrop/tools')
from simfast import run, params
from scipy.optimize import minimize

@njit(parallel=True, cache=True)
def run_all(hs, P, yg, ag, vf, dt, te):
    n = hs.size
    out = np.zeros((n, 7))
    for i in prange(n):
        r = run(hs[i], P[i], yg, ag, vf, dt, te)
        for j in range(7):
            out[i, j] = r[j]
    return out

PFOOT = 0.168

def scenarios(A, S, c, Vd, mf, mb, me, leak):
    nom = dict(A=A, y0=S + c, Vdead=Vd, m_foot=mf, m_body=mb, m_egg=me, Cd=0.65, A_leak=leak,
               e_ground=0.5, k_egg=3e4, fric=0.0, P_foot=PFOOT)
    var = [{}, dict(Cd=0.55), dict(Cd=0.78), dict(A_leak=leak * 0.5), dict(A_leak=leak * 1.6),
           dict(e_ground=0.3), dict(e_ground=0.75), dict(m_body=mb * 0.85), dict(m_body=mb * 1.2),
           dict(m_foot=mf * 0.8), dict(m_foot=mf * 1.3), dict(k_egg=1e4), dict(k_egg=1.5e5),
           dict(fric=0.15), dict(Cd=0.78, A_leak=leak * 1.6), dict(Cd=0.55, A_leak=leak * 0.5)]
    hs, P, tag = [], [], []
    for h in [6.0, 3.7, 2.4, 1.2]:
        vv = var if h == 6.0 else [{}, dict(Cd=0.78, A_leak=leak * 1.6), dict(Cd=0.55, A_leak=leak * 0.5), dict(e_ground=0.75), dict(m_body=mb * 1.2)]
        for v in vv:
            d = dict(nom); d.update(v)
            hs.append(h); P.append(params(**d)); tag.append((h, json.dumps(v)))
    return np.array(hs), np.array(P), tag

def profile(x, S, c, knots):
    inc = np.exp(x)  # mm^2, positive increments
    bleed = inc[0]
    cum = bleed + np.concatenate([[0], np.cumsum(inc[1:])])
    yk = c + S * knots
    yg = np.concatenate([[0.0, c - 1e-4], yk, [S + c + 0.05]])
    ag = np.concatenate([[bleed, bleed], cum, [cum[-1]]]) * 1e-6
    return yg, ag

def make_obj(hs, P, S, c, knots, dt=3e-6, te=0.08):
    def obj(x):
        yg, ag = profile(x, S, c, knots)
        out = run_all(hs, P, yg, ag, 0.98, dt, te)
        pe = out[:, 1]; ymin = out[:, 4]
        pen = np.sum(np.maximum(0.002 - ymin, 0)) * 2e5
        return np.max(pe) + 0.05 * np.mean(pe) + pen
    return obj

if __name__ == '__main__':
    S = float(sys.argv[1]) if len(sys.argv) > 1 else 0.125
    c = float(sys.argv[2]) if len(sys.argv) > 2 else 0.015
    D = float(sys.argv[3]) if len(sys.argv) > 3 else 0.066
    mb = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
    mf = float(sys.argv[5]) if len(sys.argv) > 5 else 0.09
    A = np.pi / 4 * D ** 2
    hs, P, tag = scenarios(A, S, c, A * 0.004, mf, mb, 0.06, 2.1e-5 * D / 0.066)
    knots = np.array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
    obj = make_obj(hs, P, S, c, knots)
    best = None
    for start in [np.log([1, 40, 40, 40, 15, 8, 2, 15, 15, 15, 8]), np.log([2, 30, 30, 30, 20, 10, 10, 10, 10, 10, 5])]:
        t = time.time()
        r = minimize(obj, start, method='Nelder-Mead', options=dict(maxiter=1500, xatol=1e-3, fatol=0.05))
        print(f"start -> {r.fun:.1f}  ({time.time()-t:.0f}s)", np.round(np.exp(r.x), 1), flush=True)
        if best is None or r.fun < best.fun:
            best = r
    yg, ag = profile(best.x, S, c, knots)
    out = run_all(hs, P, yg, ag, 0.98, 2e-6, 0.09)
    for (h, v), o in zip(tag, out):
        print(f"h={h} {v:40s} body {o[0]:6.1f}g egg {o[1]:6.1f}g stroke {o[2]*1000:6.1f}mm pmax {(o[3]-101325)/1000:6.1f}kPa ymin {o[4]*1000:5.1f}mm")
    np.save(f'/home/user/Game/eggdrop/tools/best_S{int(S*1000)}_D{int(D*1000)}.npy', best.x)
    print("increments mm2:", np.round(np.exp(best.x), 2).tolist())
