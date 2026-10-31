import numpy as np, sys, json
sys.path.insert(0, '.')
import vents as V
from optimize import scenarios, run_all
S, c, D = 0.15, 0.025, 0.072
mb, mf = float(sys.argv[1]), float(sys.argv[2])
vj = json.load(open('vents_3.5.json')); V.SIDE = vj['side']; V.HALF = V.SIDE / np.sqrt(2)
yy = np.linspace(0, (S + c) * 1000 + 30, 600)
A = V.open_area_table(vj['rows'], yy) + 1.0
A_ = np.pi / 4 * D ** 2
hs, P, tag = scenarios(A_, S, c, A_ * 0.004, mf, mb, 0.06, 2.1e-5 * D / 0.066)
out = run_all(hs, P, yy / 1000, A * 1e-6, 0.98, 2e-6, 0.09)
for h in [1.2, 2.4, 3.7, 6.0]:
    k = hs == h
    print(f"drop {h} m: egg peak nominal {out[k,1][0]:5.1f} g, worst of {k.sum()} cases {out[k,1].max():5.1f} g; body nominal {out[k,0][0]:5.1f} g; stroke used {out[k,2][0]*1000:4.0f} mm")
