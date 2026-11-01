import sys; sys.path.insert(0, '.')
from brake_sim import run
S, mh = 0.090, 0.084
print("egg peak g / slide mm at 4 ft, 8 ft, 12 ft, 20 ft")
for rings, mp in ((2, 0.168), (3, 0.190)):
    for mu in (0.25, 0.3, 0.35, 0.4, 0.45):
        F = mu * 240 * rings
        r = [run(h, F, S, mp, mh, 0.06, 0.4, 3e4, 0.3) for h in (1.2, 2.4, 3.7, 6.0)]
        print(f"{rings} rings, friction coeff {mu}: brake {F:4.0f} N | " + " | ".join(f"{x[0]:4.0f}g {x[2]*1000:3.0f}mm" for x in r))
