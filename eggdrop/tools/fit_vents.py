import numpy as np, sys, json
sys.path.insert(0, '.')
import vents as V
from optimize import profile, scenarios, run_all
S, c, D, mb, mf = 0.15, 0.025, 0.072, 0.293, 0.067
knots = np.array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
x = np.load('best_S150_D72.npy')
yg, ag = profile(x, S, c, knots)            # m, m2 (geometric)
y_mm, a_mm2 = yg * 1000, ag * 1e6
for side in [3.5, 4.0]:
    V.SIDE = side; V.HALF = side / np.sqrt(2)
    rows = V.fit_rows(y_mm, a_mm2 - a_mm2[0], c * 1000, (S + c) * 1000, pitch=V.HALF * 2 + 0.9)
    yy = np.linspace(0, (S + c) * 1000 + 30, 600)
    A = V.open_area_table(rows, yy) + a_mm2[0]
    A = np.where(yy > (S + c) * 1000 + 10, A[-1], A)
    A_ = np.pi / 4 * D ** 2
    hs, P, tag = scenarios(A_, S, c, A_ * 0.004, mf, mb, 0.06, 2.1e-5 * D / 0.066)
    out = run_all(hs, P, yy / 1000, A * 1e-6, 0.98, 2e-6, 0.09)
    out0 = run_all(hs, P, yg, ag, 0.98, 2e-6, 0.09)
    n = sum(r[1] for r in rows)
    print(f"side {side}: {len(rows)} rows, {n} holes, total {n*side**2:.0f} mm2 (+bleed {a_mm2[0]:.1f})")
    print("  rows (y below ceiling mm, n):", [(round(a, 1), b) for a, b in rows])
    for h in [6.0, 3.7, 2.4, 1.2]:
        k = hs == h
        print(f"  h={h}: egg max {out[k,1].max():5.1f} (smooth {out0[k,1].max():5.1f})  nominal {out[k,1][0]:5.1f} (smooth {out0[k,1][0]:5.1f})  min gap {out[k,4].min()*1000:5.1f}mm")
    json.dump(dict(side=side, rows=rows), open(f'vents_{side}.json', 'w'))
