#!/usr/bin/env python3
"""
render_scene.py — Visual World Production Pipeline · LOCAL provider adapter.

Authority: Architect direction 2026-07-21 — *"scroll-world — why are we not ripping this and
creating our own process to achieve this level of graphics?"* We extract the mechanics and
build our own. We do NOT install the third-party skill, and we do not hand credentials to an
agent loop.

WHAT THIS IS
------------
The first provider adapter of our own pipeline: a deterministic camera-move renderer that
turns an APPROVED still into a scroll-scrubbable clip using nothing but PIL and FFmpeg.

  approved anchor still → camera path → frames → encoded clip → poster → scroll binding

Every mechanic scroll-world uses is here except generative video:
  · anchor-first (we consume the Architect's approved Pass-3 art; we never invent art)
  · output-as-state (existing outputs are skipped, so a crash never repays finished work)
  · real-artifact validation (the seam score is computed on decoded frames, not asserted)
  · deterministic boundary frames (a scene's last frame IS the next scene's first frame)
  · cheap-preview tier (--tier previz renders at half scale)

WHY IT COSTS NOTHING
--------------------
Zero network. Zero credentials. Zero provider. Zero spend. A camera move over a high-quality
still is not a substitute for generative video in the long run, but it is the honest way to
prove the whole chain — pipeline, seams, encode, scroll binding — before a single credit is
authorised. When a generative adapter is added later it slots in at exactly one seam: it
replaces `render_frames`, and nothing downstream changes.

NOT A SPEND PATH. If this file ever grows a network call, that is a defect.
"""

import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public'


# --------------------------------------------------------------------------- #
# Camera
# --------------------------------------------------------------------------- #

def ease(t: float, kind: str = 'inout') -> float:
    """Camera easing. Linear moves read mechanical; the reference frames are hand-shot."""
    if kind == 'linear':
        return t
    if kind == 'out':
        return 1 - (1 - t) ** 3
    if kind == 'in':
        return t ** 3
    # inout — slow depart, slow arrive
    return 3 * t * t - 2 * t * t * t


def lerp_rect(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(4)]


def rect_from_spec(spec, size):
    """
    A rect is (cx, cy, scale) in normalised image space, resolved to a crop box.
    Expressing the path in centre+scale rather than pixel boxes keeps a move
    readable in the scene file and makes it resolution-independent.
    """
    w, h = size
    cx, cy, scale = spec['cx'], spec['cy'], spec['scale']
    cw, ch = w * scale, h * scale
    x0 = cx * w - cw / 2
    y0 = cy * h - ch / 2
    # Clamp inside the source; a camera that leaves the plate would letterbox.
    x0 = max(0, min(x0, w - cw))
    y0 = max(0, min(y0, h - ch))
    return [x0, y0, x0 + cw, y0 + ch]


def render_frames(scene, out_dir: Path, size, fps: int, tier: str) -> int:
    """
    Render the camera path to numbered frames.

    This is the ONE function a generative provider adapter would replace. Everything
    downstream — encode, poster, seam score, scroll binding — is provider-agnostic
    by construction, which is the whole point of building our own pipeline instead
    of adopting a vendor's.
    """
    src = Image.open(PUBLIC / scene['source']).convert('RGB')
    ssize = src.size
    n = max(2, int(round(scene['seconds'] * fps)))
    a = rect_from_spec(scene['from'], ssize)
    b = rect_from_spec(scene['to'], ssize)
    kind = scene.get('ease', 'inout')

    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for i in range(n):
        p = out_dir / f'{i:04d}.jpg'
        if p.exists():           # output-as-state: never repay finished work
            continue
        t = ease(i / (n - 1), kind)
        box = tuple(int(round(v)) for v in lerp_rect(a, b, t))
        frame = src.resize(size, Image.LANCZOS, box=box)
        frame.save(p, quality=92 if tier == 'final' else 80, optimize=True)
        written += 1
    return n


def encode(frames_dir: Path, out_mp4: Path, fps: int, tier: str) -> None:
    """
    Encode for frame-accurate scrubbing, not for streaming.

    `-g 1` makes every frame a keyframe. Without it, seeking to an arbitrary scroll
    position lands on the nearest keyframe and the scrub visibly stutters — the
    single most common way a scroll-bound clip looks broken.
    """
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    crf = '20' if tier == 'final' else '30'
    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-framerate', str(fps),
        '-i', str(frames_dir / '%04d.jpg'),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
        '-pix_fmt', 'yuv420p',
        '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
        '-movflags', '+faststart',
        str(out_mp4),
    ]
    subprocess.run(cmd, check=True)


def poster(frames_dir: Path, out_png: Path) -> None:
    """
    Poster = the clip's own first frame.

    Using the source still instead would show a visible jump on first paint, because
    the still and the encoded frame differ in crop and compression. Same
    frame-handoff doctrine as the seams, applied to the first thing a visitor sees.
    """
    Image.open(frames_dir / '0000.jpg').save(out_png, optimize=True)


# --------------------------------------------------------------------------- #
# Real-artifact validation
# --------------------------------------------------------------------------- #

def similarity(p1: Path, p2: Path) -> float:
    """
    Cheap structural similarity on two decoded frames, computed from the artifacts —
    never asserted from the plan. A seam is only as good as the frames that actually
    got encoded, so this reads the files back off disk.
    """
    a = Image.open(p1).convert('L').resize((128, 128))
    b = Image.open(p2).convert('L').resize((128, 128))
    pa, pb = list(a.getdata()), list(b.getdata())
    n = len(pa)
    ma, mb = sum(pa) / n, sum(pb) / n
    va = sum((x - ma) ** 2 for x in pa) / n
    vb = sum((x - mb) ** 2 for x in pb) / n
    cov = sum((pa[i] - ma) * (pb[i] - mb) for i in range(n)) / n
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    return ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma ** 2 + mb ** 2 + c1) * (va + vb + c2))


def seam_score(prev_frames: Path, next_frames: Path) -> float:
    last = sorted(prev_frames.glob('*.jpg'))[-1]
    first = sorted(next_frames.glob('*.jpg'))[0]
    return similarity(last, first)


# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description='Visual World pipeline — local camera-move adapter.')
    ap.add_argument('scenes', help='scene spec JSON')
    ap.add_argument('--out', default='public/world', help='output root under the app')
    ap.add_argument('--tier', choices=['previz', 'final'], default='previz')
    ap.add_argument('--fps', type=int, default=24)
    args = ap.parse_args()

    spec = json.loads(Path(args.scenes).read_text())
    size = tuple(spec['size']) if args.tier == 'final' else tuple(v // 2 for v in spec['size'])
    size = (size[0] - size[0] % 2, size[1] - size[1] % 2)   # h264 needs even dimensions

    out_root = ROOT / args.out / args.tier
    work = ROOT / '.world-frames' / args.tier
    manifest = {'tier': args.tier, 'fps': args.fps, 'size': list(size), 'scenes': []}

    prev_frames = None
    for scene in spec['scenes']:
        name = scene['id']
        frames = work / name
        n = render_frames(scene, frames, size, args.fps, args.tier)
        mp4 = out_root / f'{name}.mp4'
        if not mp4.exists():
            encode(frames, mp4, args.fps, args.tier)
        png = out_root / f'{name}.jpg'
        if not png.exists():
            poster(frames, png)

        entry = {
            'id': name,
            'src': f'/{args.out.split("public/")[-1]}/{args.tier}/{name}.mp4',
            'poster': f'/{args.out.split("public/")[-1]}/{args.tier}/{name}.jpg',
            'frames': n,
            'seconds': scene['seconds'],
            'scroll': scene.get('scroll', 1.0),
            'label': scene.get('label', ''),
            'bytes': mp4.stat().st_size,
        }
        if prev_frames is not None:
            s = seam_score(prev_frames, frames)
            entry['seam'] = round(s, 4)
            # Thresholds mirror the doctrine: pass / warn / fail-with-cause. A warn is
            # reported, never silently accepted — a silent seam is how a visible jump ships.
            entry['seam_verdict'] = 'PASS' if s >= 0.90 else 'WARN' if s >= 0.75 else 'FAIL'
        prev_frames = frames
        manifest['scenes'].append(entry)
        print(f'{name:<28} frames={n:<4} {entry["bytes"]/1024:7.0f} KB  '
              f'seam={entry.get("seam", "—")} {entry.get("seam_verdict", "")}')

    mpath = out_root / 'manifest.json'
    mpath.write_text(json.dumps(manifest, indent=2))
    print(f'\nmanifest → {mpath}')
    fails = [s for s in manifest['scenes'] if s.get('seam_verdict') == 'FAIL']
    if fails:
        print(f'SEAM FAIL on {len(fails)} seam(s) — do not ship', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
