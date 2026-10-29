"""One painted rat, cut into the engine strips, then coat and size variants.

Source art is the generated sheets (magenta grids). This file only keys,
aligns, and recolors. It does not draw characters.
"""
import json
import os
from collections import deque

import numpy as np
from PIL import Image

ROOT = '/workspace/ratgod/assets/final/sprites'
BG_ROOT = '/workspace/ratgod/assets/final/backgrounds'
INDEX = '/workspace/ratgod/assets/final/index.json'
ART = '/workspace/artifacts/imagine_images'
QC = '/workspace/artifacts/ratstyle/qc'
CELL = 128
ROLES = ('worker', 'king', 'pup', 'elder', 'herald', 'enforcer', 'founder', 'outcast')

# hue delta, saturation mul, value mul — coat pixels only
SHIFT = {
    'worker': (0.0, 1.0, 1.0),
    'founder': (0.03, 1.05, 0.90),
    'king': (0.0, 1.0, 1.0),
    'pup': (0.01, 0.82, 1.10),
    'elder': (0.02, 0.22, 0.96),
    'herald': (0.11, 0.72, 0.92),
    'enforcer': (-0.01, 0.50, 0.52),
    'outcast': (0.04, 0.42, 1.06),
}

def sheet(name, cols, rows, take=None):
    return (os.path.join(ART, name), cols, rows, take)

BANK_SRC = {
    'idle': sheet('982f958b-8167-4fd6-8efe-cdd9f03ce081.jpg', 2, 2),
    'walk': sheet('8a960681-6c4d-4e08-a01c-d4b4101182ee.jpg', 4, 2),
    'eat': sheet('79881f56-7093-46db-8517-6a18666624ae.jpg', 2, 2),
    'sleep': sheet('a59aafd4-e646-4d11-abd0-86d2557cf84c.jpg', 2, 2),
    'groom': sheet('c82f37f8-f8e9-4bbc-9d7d-1510fe6b4679.jpg', 2, 2),
    'cower': sheet('f6db3bc2-c1c5-47d4-ae4c-76a8d503871c.jpg', 2, 2),
    'cheer': sheet('a876cffa-76a9-4afe-a7b3-2cac15707e71.jpg', 2, 2),
    'kneel': sheet('60c0872d-3399-4f14-9550-5be41b6897b3.jpg', 2, 2),
    'dig': sheet('3efe7aa6-517f-49fa-872b-663b91aa6091.jpg', 2, 2),
    'king_idle': sheet('c7d78454-f4b7-41b5-a693-a239fc5b764d.jpg', 2, 2),
    'king_walk': sheet('b314fe13-c759-4d35-a726-a653f01f8ca3.jpg', 4, 2),
    'king_eat': sheet('747df332-3ad5-4b96-8728-1beb19120cf2.jpg', 2, 2),
    # later frames grew a second rat; keep the single lying pose
    'king_sleep': sheet('3e135cf9-b44c-41e3-af28-513eb787d9de.jpg', 2, 2, 1),
    # later frames grew a scribble and a second rat
    'king_decree': sheet('acaa4314-6236-49ba-a2c7-2ada4e3dd68b.jpg', 2, 2, 2),
}

ROOMS = {
    'bg_throne_hall.png': 'df086864-658f-4f5f-b89b-967496c31bda.jpg',
    'bg_nursery.png': '3c914e1b-c94c-4dd6-b536-a3a4de8d8b76.jpg',
    'bg_granary.png': 'cd5c1040-fcfd-4796-bd9c-9906462910e1.jpg',
    'bg_shrine.png': '2e00e937-bcfe-416e-ac93-2a54d0ee9484.jpg',
    'bg_barracks.png': '6ff52043-4148-4a68-b9fc-3e82913a0038.jpg',
    'bg_plaza.png': '6572294f-eabf-41fe-8159-240ce8c06367.jpg',
    'bg_burrow_entrance.png': 'f75fa6e3-0c2f-449a-a022-6ecf20acc51a.jpg',
    'bg_outcast_slum.png': '9ddca401-019e-4aea-8523-a26ba725bee8.jpg',
    'bg_workshop.png': '4837fc69-7169-48d4-8f7e-98e942083c45.jpg',
    'bg_surface_street.png': 'be07777b-166b-44a5-9c94-2568e19dea5a.jpg',
    'bg_graveyard.png': 'aa2e7971-af79-46b0-b015-bf6f57a7e3ff.jpg',
}


def key_array(arr):
    """Drop magenta, then flood-erase everything outside the black contour."""
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    mag = (r > 165) & (b > 140) & (r > g + 35) & (b > g + 25)
    arr[mag, 3] = 0
    ink = (r < 82) & (g < 82) & (b < 82) & ~mag
    h, w = ink.shape
    vis = np.zeros((h, w), dtype=bool)
    q = deque()
    edge = []
    edge.extend((x, 0) for x in range(w))
    edge.extend((x, h - 1) for x in range(w))
    edge.extend((0, y) for y in range(h))
    edge.extend((w - 1, y) for y in range(h))
    for x, y in edge:
        if not ink[y, x] and not vis[y, x]:
            vis[y, x] = True
            q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not vis[ny, nx] and not ink[ny, nx]:
                vis[ny, nx] = True
                q.append((nx, ny))
    arr[vis, 3] = 0
    return arr


def despill(arr):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    bad = (arr[:, :, 3] > 0) & (r > 135) & (b > 95) & (b > g + 16) & (r > g + 22)
    arr[bad, 3] = 0
    return arr


def touches_edge(arr, m=3):
    a = arr[:, :, 3] > 40
    return bool(a[:m].any() or a[-m:].any() or a[:, :m].any() or a[:, -m:].any())


def has_bar(arr):
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    dark = (a > 40) & (r < 45) & (g < 45) & (b < 45)
    h, w = dark.shape
    cols = list(range(0, 8)) + list(range(max(0, w - 8), w))
    for x in cols:
        if int(dark[:, x].sum()) > h * 0.72:
            return True
    return False


def largest_ok(arr):
    """Reject a cell that grew a second body. Keep small props attached or not."""
    a = arr[:, :, 3] > 40
    h, w = a.shape
    seen = np.zeros_like(a)
    areas = []
    for y in range(h):
        for x in range(w):
            if not a[y, x] or seen[y, x]:
                continue
            q = deque([(x, y)])
            seen[y, x] = True
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and a[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            areas.append(n)
    if not areas:
        return False
    areas.sort(reverse=True)
    if len(areas) > 1 and areas[1] > areas[0] * 0.45:
        return False
    return areas[0] > 800


def cells_of(path, cols, rows, take):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    cw, ch = w // cols, h // rows
    raw = np.array(im)
    out = []
    n = cols * rows if take is None else take
    i = 0
    for r in range(rows):
        for c in range(cols):
            if i >= n:
                break
            i += 1
            cell = raw[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw].copy()
            cell = despill(key_array(cell))
            if has_bar(cell) or not largest_ok(cell):
                print('  drop', os.path.basename(path), 'cell', i - 1)
                continue
            out.append(cell)
    return out


def bbox(arr):
    a = arr[:, :, 3] > 20
    ys, xs = np.where(a)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def to_cell(arr, scale):
    bb = bbox(arr)
    canvas = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    if not bb:
        return canvas
    body = Image.fromarray(arr).crop(bb)
    nw = max(1, int(body.width * scale))
    nh = max(1, int(body.height * scale))
    if nw > CELL - 8:
        k = (CELL - 8) / nw
        nw = CELL - 8
        nh = max(1, int(nh * k))
    body = body.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(body, ((CELL - nw) // 2, CELL - 6 - nh), body)
    canvas = Image.fromarray(despill(np.array(canvas)))
    return thicken(canvas)


def thicken(im, rad=2):
    arr = np.array(im)
    alpha = arr[:, :, 3] > 40
    dil = alpha.copy()
    for _ in range(rad):
        d2 = dil.copy()
        d2[1:] |= dil[:-1]
        d2[:-1] |= dil[1:]
        d2[:, 1:] |= dil[:, :-1]
        d2[:, :-1] |= dil[:, 1:]
        dil = d2
    halo = dil & ~alpha
    arr[halo] = (18, 14, 12, 255)
    return Image.fromarray(arr)


def shared_scale(frames, target=98):
    hs, ws = [], []
    for arr in frames:
        bb = bbox(arr)
        if not bb:
            continue
        hs.append(bb[3] - bb[1])
        ws.append(bb[2] - bb[0])
    if not hs:
        return 1.0
    med = sorted(hs)[len(hs) // 2]
    sc = target / med
    widest = max(ws)
    if widest * sc > CELL - 10:
        sc = (CELL - 10) / widest
    return sc


def coat_mask(arr):
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    ink = (r < 70) & (g < 70) & (b < 70)
    belly = (r > 190) & (g > 165) & (b > 140)
    pink = (r > 175) & (r.astype(np.int16) - g.astype(np.int16) > 35) & (b > 80) & (b < 210) & (g < 190)
    return (a > 30) & ~ink & ~belly & ~pink


def recolor(im, dh, sm, vm):
    if dh == 0 and sm == 1 and vm == 1:
        return im
    arr = np.array(im)
    m = coat_mask(arr)
    if not m.any():
        return im
    cols = arr[m].astype(np.float32)
    r, g, b = cols[:, 0] / 255.0, cols[:, 1] / 255.0, cols[:, 2] / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    df = mx - mn
    hue = np.zeros_like(mx)
    nz = df > 1e-6
    d = np.maximum(df, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, hue)
    hue = np.where((mx == g) & (mx != r), (b - r) / d + 2, hue)
    hue = np.where((mx == b) & (mx != r) & (mx != g), (r - g) / d + 4, hue)
    hue = np.where(nz, (hue / 6.0 + dh) % 1.0, 0)
    s = np.clip(np.where(mx > 0, df / np.maximum(mx, 1e-6), 0) * sm, 0, 1)
    v = np.clip(mx * vm, 0, 1)
    h6 = hue * 6.0
    i = np.floor(h6).astype(np.int32) % 6
    f = h6 - np.floor(h6)
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    out = np.zeros((cols.shape[0], 3), np.float32)
    for k, (c0, c1, c2) in enumerate(((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))):
        sel = i == k
        out[sel, 0] = c0[sel]
        out[sel, 1] = c1[sel]
        out[sel, 2] = c2[sel]
    rgb = np.clip(out * 255, 0, 255).astype(np.uint8)
    arr[m, 0] = rgb[:, 0]
    arr[m, 1] = rgb[:, 1]
    arr[m, 2] = rgb[:, 2]
    return Image.fromarray(arr)


def shrink(im, sc):
    nw, nh = max(1, int(CELL * sc)), max(1, int(CELL * sc))
    body = im.resize((nw, nh), Image.Resampling.LANCZOS)
    c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    c.paste(body, ((CELL - nw) // 2, CELL - 6 - nh), body)
    return c


def fit(frs, n):
    out = []
    guard = 0
    while len(out) < n and frs and guard < n + 2:
        out.extend(frs)
        guard += 1
    return out[:n]


def as_strip(frs):
    im = Image.new('RGBA', (CELL * len(frs), CELL), (0, 0, 0, 0))
    for i, f in enumerate(frs):
        im.paste(f, (i * CELL, 0), f)
    return im


def family(name, role):
    n = name.lower()
    if role == 'king':
        if any(k in n for k in ('eat', 'feast', 'indulge', 'drink')):
            return 'king_eat'
        if any(k in n for k in ('sleep', 'die', 'sick', 'executed')):
            return 'king_sleep'
        if any(k in n for k in ('decree', 'press', 'preach', 'frustrated')):
            return 'king_decree'
        if any(k in n for k in ('walk', 'run', 'patrol', 'haul', 'dig', 'drag')):
            return 'king_walk'
        return 'king_idle'
    if 'fight' in n or 'beat' in n:
        return 'dig'
    if 'dig' in n or 'gnaw' in n or 'work' in n:
        return 'dig'
    if any(k in n for k in ('walk', 'run', 'patrol', 'haul', 'steal', 'drag', 'limp')):
        return 'walk'
    if any(k in n for k in ('eat', 'feast', 'drink', 'suckle', 'indulge')):
        return 'eat'
    if any(k in n for k in ('sleep', 'die', 'sick', 'executed')):
        return 'sleep'
    if any(k in n for k in ('groom', 'nurse', 'court')):
        return 'groom'
    if 'cower' in n or 'beg' in n:
        return 'cower'
    if any(k in n for k in ('cheer', 'protest', 'vote', 'paste', 'play', 'teach', 'announce', 'dance')):
        return 'cheer'
    return 'idle'


def build_bank():
    bank = {}
    for key, (path, cols, rows, take) in BANK_SRC.items():
        raw = cells_of(path, cols, rows, take)
        if not raw:
            print('empty', key)
            continue
        sc = shared_scale(raw)
        bank[key] = [to_cell(a, sc) for a in raw]
        print(key, 'frames', len(bank[key]), 'scale', round(sc, 3))
    for king, base in (('king_walk', 'walk'), ('king_eat', 'eat'), ('king_sleep', 'sleep'), ('king_decree', 'king_idle'), ('king_idle', 'idle')):
        if king not in bank and base in bank:
            bank[king] = bank[base]
            print('fallback', king, '->', base)
    return bank


def write_sprites(bank):
    n = 0
    for fn in sorted(os.listdir(ROOT)):
        if not fn.endswith('.png'):
            continue
        role = fn.split('_', 1)[0]
        if role not in ROLES:
            continue
        path = os.path.join(ROOT, fn)
        with Image.open(path) as cur:
            if cur.height != CELL or cur.width % CELL:
                continue
            count = cur.width // CELL
        fam = family(fn, role)
        frs = fit(bank[fam], count)
        dh, sm, vm = SHIFT[role]
        if role != 'king':
            frs = [recolor(f, dh, sm, vm) for f in frs]
        as_strip(frs).save(path)
        n += 1
    print('rewrote', n)


def write_rooms():
    ids = {}
    for fn, src in ROOMS.items():
        im = Image.open(os.path.join(ART, src)).convert('RGB')
        im = im.resize((960, 540), Image.Resampling.LANCZOS)
        im.save(os.path.join(BG_ROOT, fn))
        ids[fn] = fn.replace('.png', '')
        # id is the filename without extension, which matches index ids
    with open(INDEX) as f:
        idx = json.load(f)
    want = {fn[:-4] for fn in ROOMS}
    for a in idx['assets']:
        if a.get('id') in want and a.get('type') == 'background':
            a['size'] = [960, 540]
    with open(INDEX, 'w') as f:
        json.dump(idx, f, indent=1)
        f.write('\n')
    print('rooms', len(ROOMS))


def contact(bank):
    os.makedirs(QC, exist_ok=True)
    keys = ['idle', 'walk', 'eat', 'sleep', 'groom', 'cower', 'cheer', 'dig', 'king_idle', 'king_walk', 'king_eat', 'king_sleep', 'king_decree']
    cols = 8
    sheet = Image.new('RGBA', (CELL * cols, CELL * len(keys)), (244, 239, 228, 255))
    for y, k in enumerate(keys):
        for x, fr in enumerate(bank[k][:cols]):
            sheet.paste(fr, (x * CELL, y * CELL), fr)
            fr.save(os.path.join(QC, '%s_%d.png' % (k, x)))
    sheet.save(os.path.join(QC, 'contact.png'))
    # role swatches
    row = Image.new('RGBA', (CELL * len(ROLES), CELL), (244, 239, 228, 255))
    for i, role in enumerate(ROLES):
        im = bank['king_idle'][0] if role == 'king' else bank['idle'][0]
        if role != 'king':
            im = recolor(im, *SHIFT[role])
        im.save(os.path.join(QC, 'role_%s.png' % role))
        row.paste(im, (i * CELL, 0), im)
    row.save(os.path.join(QC, 'roles.png'))
    print('qc', QC)


def main():
    bank = build_bank()
    contact(bank)
    write_sprites(bank)
    write_rooms()

if __name__ == '__main__':
    main()
