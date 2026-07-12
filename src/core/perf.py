"""Score-phase logging helpers for machine-parseable pipeline progress output."""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Iterator


@contextmanager
def logged_phase(name: str) -> Iterator[None]:
    """Log one machine-parseable completion record for a score phase."""
    started = time.perf_counter()
    try:
        yield
    finally:
        logging.getLogger(__name__).info(
            "score_phase=%s elapsed_s=%.3f",
            name,
            time.perf_counter() - started,
        )
