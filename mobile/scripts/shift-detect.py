#!/usr/bin/env python3
"""shift-detect.py: find layout shifts in a simulator screen recording.

A shift is a band of the screen that already had content and then moved up or
down (rows pushed by a late banner, a header that changes height, an image
that pops to its real size and pushes what is below it). The script reads a
recording made with `xcrun simctl io <udid> recordVideo` (Maestro's
startRecording uses the same recorder), and works like this:

  1. ffmpeg decodes the video to greyscale at 60 fps, one pixel per point;
  2. the first contentful frame is the first still frame after the
     navigation (the end of the push or of the launch cover);
  3. after that frame, each burst of change between two still frames is a
     "step". For a step the script reports when it happened, the share of
     the screen that already had content and was replaced or moved
     (share_changed), and the share drawn on blank ground (share_new, which
     is not a shift);
  4. within a step, each 16 pt band of the earlier frame is searched for in
     the later frame, up to 240 pt up or down. A band that has texture, no
     longer matches in place and matches elsewhere has moved: neighbouring
     bands with the same offset are one "shift" row with its distance in
     points. A placeholder replaced by content of another shape has no
     match, so it shows only as a step: read the distance off the pair.

Output: one CSV row per step and per moved region, and for each a
side-by-side PNG (before | after) with the region boxed; steps also get the
two frames as separate PNGs.

  shift-detect.py <video.mp4> --out <dir> [--label NAME] [--scale 3]
                  [--fcf push|launch] [--csv results.csv]
                  [--ignore-top PT] [--ignore-bottom PT] [--min-share 0.04]

How to use it:

  1. Record. In a Maestro flow on the e2e fixture: bring the app to rest,
     `startRecording: ${EVIDENCE}/<name>`, wait a second, navigate (an
     `openLink`, a tap or a `launchApp`), hold for as long as the screen
     may still change, then `stopRecording`. Do not poll for elements
     while recording. Run the fixture with OPAX_NETWORK_PROFILE=throttled
     to see the loading states a slow connection shows; record each
     screen twice to tell a real shift from noise.
  2. Detect, on any Mac with the video:
       scripts/shift-detect.py <name>.mp4 --out pairs --csv results.csv \
         --ignore-top 54 --ignore-bottom 96
     (the status bar and the iPhone's floating tab bar). Use --fcf launch
     for a recorded cold launch. For an iPad drop --ignore-bottom.
  3. Read the rows, then look at each pair: a "shift" row gives the
     distance; for a "step" compare where the same element sits before
     and after. No rows after a fix means the screen holds still.

Needs ffmpeg, ffprobe, numpy and Pillow. It does not tell a deliberate
animation from a reflow: look at the frame pair.
"""
import argparse
import csv
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

FPS = 60
BAND = 16  # pt
REACH = 240  # pt searched up and down
XSTEP = 2  # every second column is enough to match a band


def probe(video):
    out = subprocess.check_output(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
         'stream=width,height', '-of', 'json', video])
    s = json.loads(out)['streams'][0]
    return int(s['width']), int(s['height'])


def frames(video, w, h):
    """Greyscale frames at 60 fps, one pixel per point."""
    cmd = ['ffmpeg', '-v', 'error', '-i', video, '-vf',
           f'fps={FPS},scale={w}:{h}:flags=area,format=gray', '-f', 'rawvideo', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = w * h
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w)
    p.wait()


def colour_frames(video, w, h, numbers):
    """The named frame numbers (60 fps numbering) in colour, as PIL images."""
    wanted = sorted(set(numbers))
    if not wanted:
        return {}
    sel = '+'.join(f'eq(n\\,{n})' for n in wanted)
    cmd = ['ffmpeg', '-v', 'error', '-i', video, '-vf',
           f"fps={FPS},select='{sel}',scale={w}:{h}:flags=area,format=rgb24",
           '-fps_mode', 'passthrough', '-f', 'rawvideo', '-']
    raw = subprocess.check_output(cmd)
    size = w * h * 3
    return {n: Image.frombuffer('RGB', (w, h), raw[i * size:(i + 1) * size], 'raw', 'RGB', 0, 1).copy()
            for i, n in enumerate(wanted) if (i + 1) * size <= len(raw)}


def match_bands(a, b):
    """For each BAND of a: (texture, difference in place, best offset, difference there)."""
    h, _ = a.shape
    a16 = a[:, ::XSTEP].astype(np.int16)
    b16 = b[:, ::XSTEP].astype(np.int16)
    nb = h // BAND
    offsets = np.arange(-REACH, REACH + 1)
    mad = np.full((len(offsets), nb), 255.0, np.float32)
    for i, dy in enumerate(offsets):
        lo, hi = max(0, -dy), min(h, h - dy)
        rows = np.full(h, np.nan, np.float32)
        rows[lo:hi] = np.abs(a16[lo:hi] - b16[lo + dy:hi + dy]).mean(axis=1)
        bands = rows[:nb * BAND].reshape(nb, BAND).mean(axis=1)  # nan when the band leaves the frame
        ok = ~np.isnan(bands)
        mad[i, ok] = bands[ok]
    texture = a16[:nb * BAND].reshape(nb, BAND, -1).std(axis=(1, 2))
    texture_b = b16[:nb * BAND].reshape(nb, BAND, -1).std(axis=(1, 2))
    zero = mad[REACH]
    best = mad.argmin(axis=0)
    return texture, texture_b, zero, offsets[best], mad[best, np.arange(nb)]


def regions(a, b, want_swaps):
    texture, texture_b, zero, dy, there = match_bands(a, b)
    moved = (texture > 8) & (zero > 5) & (np.abs(dy) >= 2) & (there < np.maximum(2.5, 0.3 * zero))
    swapped = (texture > 8) & (texture_b > 8) & (zero > 12) & ~moved & (there > 0.6 * zero)
    out = []
    nb = len(dy)
    i = 0
    while i < nb:
        if moved[i]:
            j = i
            while j + 1 < nb and moved[j + 1] and abs(int(dy[j + 1]) - int(dy[i])) <= 2:
                j += 1
            if j > i:  # at least two bands: 32 pt
                out.append(('shift', i * BAND, (j + 1) * BAND, int(np.median(dy[i:j + 1]))))
            i = j + 1
        elif want_swaps and swapped[i]:
            j = i
            while j + 1 < nb and swapped[j + 1]:
                j += 1
            if j - i >= 2:  # at least three bands: 48 pt
                out.append(('swap', i * BAND, (j + 1) * BAND, 0))
            i = j + 1
        else:
            i += 1
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('--out', required=True)
    ap.add_argument('--label')
    ap.add_argument('--scale', type=float, help='device pixels per point (default: 3 for a phone, 2 for an iPad)')
    ap.add_argument('--fcf', choices=['push', 'launch'], default='push',
                    help='push: first still frame after the navigation; launch: after the launch cover has gone')
    ap.add_argument('--csv')
    ap.add_argument('--ignore-top', type=int, default=0, help='points to skip at the top (status bar)')
    ap.add_argument('--ignore-bottom', type=int, default=0, help='points to skip at the bottom (a floating tab bar)')
    ap.add_argument('--min-share', type=float, default=0.04, help='smallest share of the screen changed that counts as a step')
    args = ap.parse_args()
    label = args.label or os.path.splitext(os.path.basename(args.video))[0]
    pw, ph = probe(args.video)
    scale = args.scale or (3 if ph / pw > 1.8 else 2)
    w, h = round(pw / scale), round(ph / scale)
    os.makedirs(args.out, exist_ok=True)

    # Pass 1: how much of the screen changes from each frame to the next.
    keep = []
    change = []
    prev = None
    for f in frames(args.video, w, h):
        keep.append(f)
        change.append(0.0 if prev is None else float((np.abs(f.astype(np.int16) - prev) > 10).mean()))
        prev = f.astype(np.int16)
    n = len(keep)
    change = np.array(change)
    # The navigation: the first frame where a fifth of the screen changes at once (a link swaps the
    # screen in one frame), or the first run of smaller changes (a push, a launch zoom, a fade).
    big = np.flatnonzero(change > 0.03)
    runs = []
    for t in big:
        if runs and t - runs[-1][1] <= 6:
            runs[-1][1] = int(t)
        else:
            runs.append([int(t), int(t)])
    runs = [r for r in runs if r[1] - r[0] >= 3 or change[r[0]:r[1] + 1].max() > 0.2]
    if not runs:
        print(f'{label}: no navigation found in {n} frames', file=sys.stderr)
        nav, fcf = 0, 0
    else:
        nav = runs[0][0]
        pick = runs[0] if args.fcf == 'push' or len(runs) < 2 else runs[1]
        fcf = min(n - 1, pick[1] + 1)
    ms = lambda t: round((t - fcf) * 1000 / FPS)
    top, bot = args.ignore_top, h - args.ignore_bottom

    # Pass 2: steps. A step is a burst of change between two still frames (joined across gaps under
    # 200 ms, cut every 500 ms while the screen keeps changing, as it does under streamed text).
    busy = np.array([float((np.abs(keep[t][top:bot].astype(np.int16) - keep[t - 1][top:bot]) > 10).mean()) if t else 0.0 for t in range(n)]) > 0.002
    steps = []
    t = fcf + 1
    while t < n:
        if not busy[t]:
            t += 1
            continue
        end = t
        u = t + 1
        while u < n and u - end <= 12 and u - t < 30:
            if busy[u]:
                end = u
            u += 1
        steps.append((t - 1, min(n - 1, end + 1)))
        t = end + 1
    events = []
    for fa, fb in steps:
        a, b = keep[fa][top:bot], keep[fb][top:bot]
        texture, texture_b, zero, dy, there = match_bands(a, b)
        had = texture > 3  # placeholder bones are faint: a low bar for "had content"
        changed = zero > 5
        share_changed = float((had & changed).mean()) * (bot - top) / h   # content replaced or moved
        share_new = float((~had & (texture_b > 8)).mean()) * (bot - top) / h  # content drawn on blank
        moved = [r for r in regions(a, b, False)]
        if share_changed + share_new < args.min_share and not moved:
            continue
        step = [float(np.abs(keep[u + 1][top:bot].astype(np.int16) - keep[u][top:bot]).mean()) for u in range(fa, fb)]
        at = fa + int(np.argmax(step)) + 1
        rows_changed = np.flatnonzero(had & changed)
        events.append({'kind': 'step', 'a': fa, 'b': fb, 'at': at, 'dy': 0, 'share': share_changed, 'new': share_new,
                       'y0': top + int(rows_changed.min()) * BAND if len(rows_changed) else top,
                       'y1': top + (int(rows_changed.max()) + 1) * BAND if len(rows_changed) else top})
        for _, y0, y1, d in moved:
            events.append({'kind': 'shift', 'a': fa, 'b': fb, 'at': at, 'dy': d, 'share': (y1 - y0) / h, 'new': 0.0,
                           'y0': top + y0, 'y1': top + y1})

    shots = colour_frames(args.video, w, h, [e['a'] for e in events] + [e['b'] for e in events])
    rows = []
    for i, e in enumerate(events, 1):
        base = f"{label}-{i:02d}-{e['kind']}-{ms(e['at'])}ms"
        pa, pb = shots.get(e['a']), shots.get(e['b'])
        if pa and pb:
            if e['kind'] == 'step':
                pa.save(os.path.join(args.out, base + '-before.png'))
                pb.save(os.path.join(args.out, base + '-after.png'))
            pair = Image.new('RGB', (w * 2 + 8, h), 'white')
            pair.paste(pa, (0, 0))
            pair.paste(pb, (w + 8, 0))
            d = ImageDraw.Draw(pair)
            d.rectangle([1, e['y0'], w - 2, e['y1']], outline='red', width=2)
            d.rectangle([w + 9, e['y0'] + e['dy'], 2 * w + 6, e['y1'] + e['dy']], outline='red', width=2)
            pair.save(os.path.join(args.out, base + '-pair.png'))
        rows.append({'video': label, 'event': i, 'kind': e['kind'], 'ms_after_first_content': ms(e['at']),
                     'ms_after_navigation': round((e['at'] - nav) * 1000 / FPS), 'dy_pt': e['dy'],
                     'top_pt': e['y0'], 'bottom_pt': e['y1'], 'share_changed': round(e['share'], 2),
                     'share_new': round(e['new'], 2), 'frame_before': e['a'], 'frame_after': e['b'], 'evidence': base})
    print(f"{label}: {n} frames {w}x{h} pt, navigation at frame {nav}, first content at frame {fcf}, "
          f"{sum(r['kind'] == 'step' for r in rows)} steps, {sum(r['kind'] == 'shift' for r in rows)} moved regions")
    for r in rows:
        print(f"  {r['kind']:5} {r['ms_after_first_content']:6} ms  dy {r['dy_pt']:5} pt  y {r['top_pt']}-{r['bottom_pt']}  "
              f"replaced {r['share_changed']}  new {r['share_new']}  {r['evidence']}")
    if args.csv and rows:
        new = not os.path.exists(args.csv)
        with open(args.csv, 'a', newline='') as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0]))
            if new:
                wr.writeheader()
            wr.writerows(rows)


if __name__ == '__main__':
    main()
