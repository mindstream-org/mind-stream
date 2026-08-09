"""Regression tests for MindStream's hardware-aware render presets."""

import unittest
from unittest.mock import patch

from reel_generator import (
    CALIBRATION_WORKER_MEMORY_BYTES,
    HardwareProfile,
    PRESETS,
    _candidate_worker_counts,
    _resolve_preset,
)


class PresetResolutionTests(unittest.TestCase):
    def test_only_normal_and_fast_are_available(self):
        self.assertEqual(set(PRESETS), {"normal", "fast"})

    def test_normal_is_scheduler_managed_background_work(self):
        hardware = HardwareProfile(
            logical_cpus=(0, 1, 2, 3, 4, 5, 6, 7),
            physical_core_groups=((0, 4), (1, 5), (2, 6), (3, 7)),
        )

        normal = _resolve_preset("normal", hardware)

        self.assertEqual(normal["writer_processes"], 1)
        self.assertEqual(normal["ffmpeg_threads"], 1)
        self.assertEqual(normal["cpu_affinity"], ())
        self.assertGreater(normal["niceness"], 0)
        self.assertEqual(normal["cpu_quota_percent"], 60)
        self.assertEqual(normal["frame_size"], (720, 1280))
        self.assertEqual(normal["target_fps"], 24)

    def test_fast_starts_with_two_workers_when_hardware_has_headroom(self):
        hardware = HardwareProfile(
            logical_cpus=tuple(range(16)),
            physical_core_groups=tuple((i, i + 8) for i in range(8)),
        )

        with patch(
            "reel_generator._available_memory_bytes",
            return_value=3 * CALIBRATION_WORKER_MEMORY_BYTES,
        ):
            fast = _resolve_preset("fast", hardware)

        self.assertEqual(fast["writer_processes"], 2)
        self.assertEqual(fast["ffmpeg_threads"], 2)
        self.assertEqual(fast["cpu_affinity"], ())
        self.assertEqual(fast["niceness"], 0)
        self.assertIsNone(fast["cpu_quota_percent"])
        self.assertEqual(fast["frame_size"], (720, 1280))

    def test_fast_degrades_safely_on_one_core(self):
        hardware = HardwareProfile(logical_cpus=(0,), physical_core_groups=((0,),))

        with patch(
            "reel_generator._available_memory_bytes",
            return_value=3 * CALIBRATION_WORKER_MEMORY_BYTES,
        ):
            fast = _resolve_preset("fast", hardware)

        self.assertEqual(fast["writer_processes"], 1)
        self.assertEqual(fast["ffmpeg_threads"], 1)
        self.assertEqual(fast["cpu_affinity"], ())

    def test_fast_leaves_a_core_available_on_two_core_hardware(self):
        hardware = HardwareProfile(
            logical_cpus=(0, 1, 2, 3), physical_core_groups=((0, 2), (1, 3))
        )

        with patch(
            "reel_generator._available_memory_bytes",
            return_value=3 * CALIBRATION_WORKER_MEMORY_BYTES,
        ):
            fast = _resolve_preset("fast", hardware)

        self.assertEqual(fast["writer_processes"], 1)
        self.assertEqual(fast["cpu_affinity"], ())

    def test_fast_reduces_its_first_run_fallback_when_memory_is_tight(self):
        hardware = HardwareProfile(
            logical_cpus=tuple(range(8)),
            physical_core_groups=((0, 4), (1, 5), (2, 6), (3, 7)),
        )

        with patch(
            "reel_generator._available_memory_bytes",
            return_value=CALIBRATION_WORKER_MEMORY_BYTES,
        ):
            fast = _resolve_preset("fast", hardware)

        self.assertEqual(fast["writer_processes"], 1)
        self.assertEqual(fast["cpu_affinity"], ())

    def test_calibration_candidates_reserve_a_core_and_respect_memory(self):
        hardware = HardwareProfile(
            logical_cpus=tuple(range(8)),
            physical_core_groups=((0, 4), (1, 5), (2, 6), (3, 7)),
        )

        with patch(
            "reel_generator._available_memory_bytes",
            return_value=3 * CALIBRATION_WORKER_MEMORY_BYTES,
        ):
            self.assertEqual(_candidate_worker_counts(hardware), (1, 2, 3))

        with patch(
            "reel_generator._available_memory_bytes",
            return_value=CALIBRATION_WORKER_MEMORY_BYTES,
        ):
            self.assertEqual(_candidate_worker_counts(hardware), (1,))

    def test_presets_use_the_same_output_profile(self):
        self.assertEqual(PRESETS["fast"]["frame_size"], PRESETS["normal"]["frame_size"])
        self.assertEqual(PRESETS["fast"]["target_fps"], PRESETS["normal"]["target_fps"])
        self.assertEqual(PRESETS["normal"]["video_quality"], "middle")
        self.assertEqual(PRESETS["fast"]["video_quality"], "low")


if __name__ == "__main__":
    unittest.main()
