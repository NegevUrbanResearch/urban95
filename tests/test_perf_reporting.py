from __future__ import annotations

import core.perf as perf
import pytest


def test_logged_phase_emits_one_machine_parseable_completion_line(monkeypatch, caplog):
    ticks = iter([10.0, 11.25])
    monkeypatch.setattr(perf.time, "perf_counter", lambda: next(ticks))
    caplog.set_level("INFO")

    with perf.logged_phase("score.discrete.compute"):
        pass

    matches = [record.getMessage() for record in caplog.records if record.name == "core.perf"]
    assert matches == ["score_phase=score.discrete.compute elapsed_s=1.250"]


def test_logged_phase_logs_and_propagates_body_exception(monkeypatch, caplog):
    ticks = iter([20.0, 21.25])
    monkeypatch.setattr(perf.time, "perf_counter", lambda: next(ticks))
    caplog.set_level("INFO")

    with pytest.raises(RuntimeError, match="boom"):
        with perf.logged_phase("score.discrete.compute"):
            raise RuntimeError("boom")

    matches = [record.getMessage() for record in caplog.records if record.name == "core.perf"]
    assert matches == ["score_phase=score.discrete.compute elapsed_s=1.250"]
