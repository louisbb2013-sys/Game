import numpy as np, sys, json
sys.path.insert(0, '.')
import parts as P
cap = P.base_cap()
body = P.body()
lid = P.lid()
bz = body.translate((0, 0, P.DISC_T))
best = []
for a in range(0, 360, 15):
    v = (cap ^ bz.rotate((0, 0, a))).volume()
    best.append((v, a))
best.sort(); print("cap/body overlap mm3 (best 3 angles):", best[:3], " worst:", best[-1])
lz = lid.translate((0, 0, P.ZB_RIM - P.NECK_H))
best = []
for a in range(0, 360, 15):
    v = (body ^ lz.rotate((0, 0, a))).volume()
    best.append((v, a))
best.sort(); print("body/lid overlap mm3 (best 3 angles):", best[:3], " worst:", best[-1])
# lid seats on body rim? gap between lid shoulder and rim:
print("lid shoulder z (lid coords) =", P.NECK_H + 0.5, " body rim in lid coords =", P.NECK_H)
# head in bore, bar in guide, pin
hd = P.head().translate((0, 0, P.DISC_T + P.ZB_HEAD0))
print("head/body overlap:", (hd ^ bz).volume(), " head/cap:", (hd ^ cap).volume())
