import pytest
from unittest.mock import patch
from pipeline import cli

def test_run_parallel_handlers_overlaps(monkeypatch):
    order = []
    def shade():
        order.append("shade_start"); __import__("time").sleep(0.05); order.append("shade_end")
    def iso():
        order.append("iso_start"); __import__("time").sleep(0.05); order.append("iso_end")
    monkeypatch.setitem(cli.STAGE_HANDLERS, "shade", shade)
    monkeypatch.setitem(cli.STAGE_HANDLERS, "isochrones", iso)
    with patch("pipeline.cli.ThreadPoolExecutor", wraps=cli.ThreadPoolExecutor) as pooled:
        cli.run_parallel_handlers(["shade", "isochrones"])
    assert pooled.called
    assert order.index("shade_start") < order.index("iso_end")
    assert order.index("iso_start") < order.index("shade_end")


def test_run_parallel_handlers_propagates_failure(monkeypatch):
    def shade():
        raise RuntimeError("shade boom")

    def iso():
        __import__("time").sleep(0.05)

    monkeypatch.setitem(cli.STAGE_HANDLERS, "shade", shade)
    monkeypatch.setitem(cli.STAGE_HANDLERS, "isochrones", iso)
    with patch("pipeline.cli.ThreadPoolExecutor", wraps=cli.ThreadPoolExecutor) as pooled:
        with pytest.raises(RuntimeError, match="shade boom"):
            cli.run_parallel_handlers(["shade", "isochrones"])
    assert pooled.called
