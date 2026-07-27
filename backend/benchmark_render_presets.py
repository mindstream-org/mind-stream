"""Benchmark MovieLite worker/quota combinations with a fixed local export.

Run from backend after selecting an existing video and narration file:
  venv/bin/python benchmark_render_presets.py --video path/to/clip.mp4 --audio path/to/audio.mp3
"""

import argparse
import contextlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


PROFILES: Tuple[Tuple[str, int, int], ...] = (
    ("one-worker-50", 1, 50),
    ("two-workers-50", 2, 50),
    ("two-workers-60", 2, 60),
    ("two-workers-75", 2, 75),
    ("three-workers-75", 3, 75),
)


def _read_cpu_usage(cgroup_path: Path) -> int:
    values = dict(line.split() for line in (cgroup_path / "cpu.stat").read_text().splitlines())
    return int(values["usage_usec"])


def _cgroup_path(unit: str) -> Optional[Path]:
    result = subprocess.run(
        ["systemctl", "--user", "show", unit, "--property=ControlGroup", "--value"],
        capture_output=True,
        text=True,
        check=False,
    )
    group = result.stdout.strip()
    return Path("/sys/fs/cgroup") / group.lstrip("/") if group else None


def _unit_is_active(unit: str) -> bool:
    return (
        subprocess.run(
            ["systemctl", "--user", "is-active", "--quiet", unit], check=False
        ).returncode
        == 0
    )


def _run_child(args: argparse.Namespace) -> int:
    os.chdir(Path(__file__).parent)
    from reel_generator import ReelGenerator

    generator = ReelGenerator(preset="  ")
    generator._spinner = lambda _: contextlib.nullcontext()
    # Benchmark Linux scheduling without affinity: let the kernel place workers.
    generator.preset_cfg["writer_processes"] = args.workers
    generator.preset_cfg["cpu_affinity"] = ()
    generator.composite_reel(
        video_paths=[args.video],
        tts_path=args.audio,
        output_path=args.output,
        subtitle_list=["A short representative export", "for preset comparison"],
        tts_duration=args.duration,
    )
    return 0


def _benchmark_profile(
    name: str,
    workers: int,
    quota: int,
    args: argparse.Namespace,
    output_dir: Path,
) -> Dict[str, Any]:
    unit = f"mindstream-benchmark-{os.getpid()}-{name}.service"
    output_path = output_dir / f"{name}.mp4"
    command = [
        "systemd-run",
        "--user",
        "--quiet",
        "--no-block",
        "--unit",
        unit,
        "-p",
        f"CPUQuota={quota}%",
        sys.executable,
        str(Path(__file__).resolve()),
        "--child",
        "--workers",
        str(workers),
        "--duration",
        str(args.duration),
        "--video",
        str(Path(args.video).resolve()),
        "--audio",
        str(Path(args.audio).resolve()),
        "--output",
        str(output_path),
    ]
    subprocess.run(command, check=True)

    cgroup = None
    for _ in range(50):
        cgroup = _cgroup_path(unit)
        if cgroup and (cgroup / "cpu.stat").exists():
            break
        time.sleep(0.05)
    if not cgroup or not (cgroup / "cpu.stat").exists():
        raise RuntimeError(f"Could not inspect benchmark cgroup for {name}")

    start_time = time.monotonic()
    last_time = start_time
    start_usage = _read_cpu_usage(cgroup)
    last_usage = start_usage
    peak_cpu_percent = 0.0
    peak_memory_bytes = 0

    while _unit_is_active(unit):
        time.sleep(0.1)
        now = time.monotonic()
        try:
            usage = _read_cpu_usage(cgroup)
        except FileNotFoundError:
            # The scope exited between the active-state check and this sample.
            break
        elapsed = now - last_time
        if elapsed > 0:
            peak_cpu_percent = max(
                peak_cpu_percent, (usage - last_usage) / 1_000_000 / elapsed * 100
            )
        memory_peak = cgroup / "memory.peak"
        if memory_peak.exists():
            peak_memory_bytes = max(peak_memory_bytes, int(memory_peak.read_text()))
        last_time = now
        last_usage = usage

    total_seconds = time.monotonic() - start_time
    # A transient scope may be collected immediately after it stops. The final
    # active-state sample is therefore the authoritative value to retain.
    final_usage = last_usage
    memory_peak = cgroup / "memory.peak"
    if memory_peak.exists():
        peak_memory_bytes = max(peak_memory_bytes, int(memory_peak.read_text()))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"{name} did not produce an output file")

    return {
        "profile": name,
        "workers": workers,
        "quota_percent": quota,
        "wall_seconds": round(total_seconds, 2),
        "average_cpu_percent": round(
            (final_usage - start_usage) / 1_000_000 / total_seconds * 100, 1
        ),
        "peak_cpu_percent": round(peak_cpu_percent, 1),
        "peak_memory_mib": round(peak_memory_bytes / 1024 / 1024, 1),
        "output": str(output_path),
    }


def _run_benchmark(args: argparse.Namespace) -> int:
    if not shutil.which("systemd-run"):
        raise RuntimeError("This benchmark requires systemd-run and cgroup v2")

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    results: List[Dict[str, Any]] = []

    for name, workers, quota in PROFILES:
        print(f"Benchmarking {name}: {workers} worker(s), {quota}% CPU quota...")
        results.append(_benchmark_profile(name, workers, quota, args, output_dir))

    print(json.dumps(results, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark MovieLite render profiles")
    parser.add_argument("--video", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output-dir", default="/tmp/mindstream-render-benchmarks")
    parser.add_argument("--duration", type=float, default=8.0)
    parser.add_argument("--workers", type=int)
    parser.add_argument("--output")
    parser.add_argument("--child", action="store_true")
    args = parser.parse_args()

    if args.child:
        return _run_child(args)
    return _run_benchmark(args)


if __name__ == "__main__":
    raise SystemExit(main())
