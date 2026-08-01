#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27"]
# ///
"""
OpenRouter image + video generation, with storyboard chaining.

The designer skill's gen.py routes all video through Fal. OpenRouter serves 20
video models of its own on a different endpoint (POST /api/v1/videos, async),
so this covers that path instead.

    uv run design/tools/orv.py still "PROMPT" --name screen --count 2
    uv run design/tools/orv.py clip  "PROMPT" --first design/assets/still-01.png --duration 8
    uv run design/tools/orv.py board board.json

`board` is the reason this exists. Seedance supports first_frame AND last_frame,
so a long sequence is not one long prompt: it is N clips where clip K's last
frame is clip K+1's first frame. Point the final clip's last frame back at the
opening still and the whole thing loops seamlessly. That is how you get past any
single-clip duration ceiling.

Every asset gets a sidecar .json recording exactly how it was made.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
from pathlib import Path

import httpx

API = "https://openrouter.ai/api/v1"
ENV_PATHS = [
    Path.cwd() / ".env",
    Path.home() / ".config" / "designer" / ".env",
    Path.home() / ".designer.env",
]


def key() -> str:
    if k := os.environ.get("OPENROUTER_API_KEY"):
        return k
    for p in ENV_PATHS:
        if not p.is_file():
            continue
        for line in p.read_text().splitlines():
            line = line.strip().removeprefix("export ").strip()
            if line.startswith("OPENROUTER_API_KEY="):
                return line.partition("=")[2].strip().strip("'\"")
    sys.exit("no OPENROUTER_API_KEY found in env, ./.env or ~/.config/designer/.env")


def data_uri(path: Path) -> str:
    """Frame images accept a data URL, so local stills seed a clip directly."""
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def sidecar(path: Path, payload: dict) -> None:
    """An asset you cannot regenerate is an asset you cannot revise."""
    clean = {k: v for k, v in payload.items() if isinstance(v, (str, int, float, bool, type(None)))}
    path.with_suffix(".json").write_text(json.dumps(clean, indent=2))


# ----------------------------------------------------------------- stills

def still(args) -> list[Path]:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    with httpx.Client(timeout=300) as c:
        for i in range(1, args.count + 1):
            content: list | str = args.prompt
            if args.ref:
                content = [
                    {"type": "text", "text": args.prompt},
                    {"type": "image_url", "image_url": {"url": data_uri(Path(args.ref))}},
                ]
            r = c.post(
                f"{API}/chat/completions",
                headers={"Authorization": f"Bearer {key()}"},
                json={
                    "model": args.model,
                    "messages": [{"role": "user", "content": content}],
                    "modalities": ["image", "text"],
                },
            )
            if r.status_code >= 400:
                sys.exit(f"openrouter {r.status_code}: {r.text[:500]}")
            msg = (r.json().get("choices") or [{}])[0].get("message") or {}
            imgs = msg.get("images") or []
            if not imgs:
                sys.exit(f"no image returned: {json.dumps(msg)[:400]}")
            for img in imgs:
                url = img.get("image_url", {}).get("url", "")
                blob = (
                    base64.b64decode(url.split(",", 1)[1])
                    if url.startswith("data:")
                    else c.get(url, timeout=120).content
                )
                p = out_dir / f"{args.name}-{i:02d}.png"
                p.write_bytes(blob)
                sidecar(p, {"prompt": args.prompt, "model": args.model, "ref": args.ref})
                written.append(p)
                print(f"  {p}  {len(blob)/1024:.0f}kb")
    return written


# ------------------------------------------------------------------ clips

def submit_clip(c: httpx.Client, *, model, prompt, duration, size, first=None,
                last=None, seed=None, audio=False) -> str:
    frames = []
    if first:
        frames.append({"type": "image_url", "image_url": {"url": data_uri(Path(first))},
                       "frame_type": "first_frame"})
    if last:
        frames.append({"type": "image_url", "image_url": {"url": data_uri(Path(last))},
                       "frame_type": "last_frame"})

    body: dict = {"model": model, "prompt": prompt, "duration": duration,
                  "size": size, "generate_audio": audio}
    if frames:
        body["frame_images"] = frames
    if seed is not None:
        body["seed"] = seed

    r = c.post(f"{API}/videos", headers={"Authorization": f"Bearer {key()}"}, json=body)
    if r.status_code >= 400:
        sys.exit(f"submit failed {r.status_code}: {r.text[:600]}")
    job = r.json()
    print(f"  job {job.get('id')} [{job.get('status')}]")
    return job["id"]


def wait_and_download(c: httpx.Client, job_id: str, dest: Path, poll: int, timeout: int) -> Path:
    deadline = time.time() + timeout
    last_status = ""
    while time.time() < deadline:
        r = c.get(f"{API}/videos/{job_id}", headers={"Authorization": f"Bearer {key()}"})
        d = r.json()
        status = d.get("status", "?")
        if status != last_status:
            print(f"  {job_id} {status}")
            last_status = status
        if status == "completed":
            v = c.get(f"{API}/videos/{job_id}/content?index=0",
                      headers={"Authorization": f"Bearer {key()}"}, timeout=300)
            dest.write_bytes(v.content)
            cost = (d.get("usage") or {}).get("cost")
            print(f"  {dest}  {len(v.content)/1e6:.1f}mb  cost ${cost}")
            return dest
        if status in ("failed", "cancelled", "expired"):
            sys.exit(f"job {job_id} {status}: {d.get('error')}")
        time.sleep(poll)
    sys.exit(f"job {job_id} timed out after {timeout}s")


def clip(args) -> None:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{args.name}.mp4"
    with httpx.Client(timeout=300) as c:
        jid = submit_clip(c, model=args.model, prompt=args.prompt, duration=args.duration,
                          size=args.size, first=args.first, last=args.last,
                          seed=args.seed, audio=args.audio)
        wait_and_download(c, jid, dest, args.poll, args.timeout)
    sidecar(dest, vars(args))


def board(args) -> None:
    """
    Chain clips into one long sequence.

      { "model": "...", "size": "1080x1920", "duration": 8, "seed": 7,
        "loop": true,
        "beats": [ {"name":"a","prompt":"...","first":"stills/a.png"},
                   {"name":"b","prompt":"...","first":"stills/b.png"} ] }

    Each beat's `first` still is its opening frame and the previous beat's
    closing frame, so the seam between clips is an identical image rather than a
    dissolve. With "loop": true the final beat closes on the first beat's still.
    """
    spec = json.loads(Path(args.spec).read_text())
    beats = spec["beats"]
    out_dir = Path(spec.get("out", args.out))
    out_dir.mkdir(parents=True, exist_ok=True)

    made: list[Path] = []
    with httpx.Client(timeout=300) as c:
        for i, b in enumerate(beats):
            nxt = beats[(i + 1) % len(beats)]
            last = nxt.get("first") if (spec.get("loop") or i + 1 < len(beats)) else None
            print(f"[{i+1}/{len(beats)}] {b['name']}")
            jid = submit_clip(
                c, model=spec.get("model", "bytedance/seedance-2.0"),
                prompt=b["prompt"], duration=b.get("duration", spec.get("duration", 8)),
                size=spec.get("size", "1080x1920"), first=b.get("first"), last=last,
                seed=spec.get("seed"), audio=spec.get("generate_audio", False),
            )
            made.append(wait_and_download(c, jid, out_dir / f"{b['name']}.mp4",
                                          args.poll, args.timeout))

    concat = out_dir / "concat.txt"
    concat.write_text("".join(f"file '{p.name}'\n" for p in made))
    print(f"\n{len(made)} clips. Join them with:\n"
          f"  ffmpeg -f concat -safe 0 -i {concat} -c copy {out_dir/'loop.mp4'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("still", help="generate stills")
    s.add_argument("prompt")
    s.add_argument("--model", default="google/gemini-3-pro-image")
    s.add_argument("--count", type=int, default=2)
    s.add_argument("--name", default="still")
    s.add_argument("--ref", help="reference image for consistency")
    s.add_argument("--out", default="design/assets/raw")
    s.set_defaults(fn=still)

    v = sub.add_parser("clip", help="one video clip")
    v.add_argument("prompt")
    v.add_argument("--model", default="bytedance/seedance-2.0")
    v.add_argument("--duration", type=int, default=8)
    v.add_argument("--size", default="1080x1920")
    v.add_argument("--first")
    v.add_argument("--last")
    v.add_argument("--seed", type=int)
    v.add_argument("--audio", action="store_true")
    v.add_argument("--name", default="clip")
    v.add_argument("--out", default="design/assets/raw")
    v.add_argument("--poll", type=int, default=10)
    v.add_argument("--timeout", type=int, default=1800)
    v.set_defaults(fn=clip)

    b = sub.add_parser("board", help="chain clips from a storyboard json")
    b.add_argument("spec")
    b.add_argument("--out", default="design/assets/raw")
    b.add_argument("--poll", type=int, default=10)
    b.add_argument("--timeout", type=int, default=1800)
    b.set_defaults(fn=board)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
