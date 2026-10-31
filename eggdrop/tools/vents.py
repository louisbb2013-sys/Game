"""Turn the optimised vent-area curve into real diamond holes, and give the
exact open-area table for the simulation."""
import numpy as np

SIDE = 5.0          # diamond square side (mm) -> area 25 mm2, height 7.07 mm
HALF = SIDE / np.sqrt(2)


def open_area_table(rows, y_grid_mm):
    """rows: list of (y_centre_mm below ceiling, n_holes).  Returns open area mm2
    at each chamber height y (holes between ceiling and head top are open)."""
    A = np.zeros_like(y_grid_mm, dtype=float)
    for yc, n in rows:
        top = yc - HALF
        d = np.clip(y_grid_mm - top, 0, 2 * HALF)
        part = np.where(d <= HALF, d ** 2, 2 * HALF ** 2 - (2 * HALF - d) ** 2)
        A += n * part
    return A


def fit_rows(y_mm, cum_mm2, y_lo, y_hi, pitch=7.6):
    """Greedy fit of hole rows to a target cumulative-area curve A(y)."""
    centres = np.arange(y_lo + HALF + 0.5, y_hi - HALF - 0.5, pitch)
    rows = []
    placed = 0.0
    for yc in centres:
        target = np.interp(yc + HALF, y_mm, cum_mm2)
        n = int(round((target - placed) / SIDE ** 2))
        n = max(0, min(n, 12))
        if n:
            rows.append((float(yc), n))
            placed += n * SIDE ** 2
    return rows
