"""Same-directory staged publication helpers.

Each individual ``os.replace`` is atomic.  A multi-file generation is guarded
by in-process rollback, but is not crash-atomic across all paths and readers
can observe the brief replacement window between individual replacements.
"""

from __future__ import annotations

from contextlib import contextmanager
import logging
import os
import tempfile
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)


def _unique_sibling(path: Path, *, suffix: str) -> Path:
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=suffix, dir=path.parent)
    os.close(fd)
    candidate = Path(name)
    candidate.unlink(missing_ok=True)
    return candidate


def _cleanup(paths: Sequence[Path], error: BaseException | None = None) -> None:
    failures: list[BaseException] = []
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except BaseException as exc:
            failures.append(exc)
    if error is not None:
        for failure in failures:
            error.add_note(f"Atomic publication cleanup failed: {failure}")
    elif failures:
        for failure in failures:
            logger.warning("Atomic publication cleanup failed: %s", failure)


@contextmanager
def staged_output_paths(destinations: Sequence[Path]):
    canonical = tuple(Path(path) for path in destinations)
    if len({path for path in canonical}) != len(canonical):
        raise ValueError("destinations must be unique")
    staged: list[Path] = []
    try:
        for destination in canonical:
            destination.parent.mkdir(parents=True, exist_ok=True)
            staged.append(_unique_sibling(destination, suffix=".stage"))
        yield tuple(staged)
    finally:
        _cleanup(staged)


def commit_staged_files(
    staged_to_canonical: Sequence[tuple[Path, Path]],
) -> None:
    pairs = tuple((Path(staged), Path(canonical)) for staged, canonical in staged_to_canonical)
    if not pairs:
        return
    staged_paths = [staged for staged, _ in pairs]
    canonical_paths = [canonical for _, canonical in pairs]
    if len(set(staged_paths)) != len(staged_paths):
        raise ValueError("staged paths must be unique")
    if len(set(canonical_paths)) != len(canonical_paths):
        raise ValueError("canonical paths must be unique")
    for staged, canonical in pairs:
        if staged == canonical:
            raise ValueError("staged path must differ from canonical path")
        if staged.parent != canonical.parent:
            raise ValueError("staged and canonical paths must share a parent")
        if not staged.is_file():
            raise FileNotFoundError(staged)

    backups: list[tuple[Path, Path]] = []
    installed: list[Path] = []
    try:
        for _, canonical in pairs:
            if canonical.exists():
                backup = _unique_sibling(canonical, suffix=".backup")
                os.replace(canonical, backup)
                backups.append((canonical, backup))
        for staged, canonical in pairs:
            os.replace(staged, canonical)
            installed.append(canonical)
    except BaseException as original:
        rollback_errors: list[BaseException] = []
        for canonical in reversed(installed):
            try:
                canonical.unlink(missing_ok=True)
            except BaseException as exc:
                rollback_errors.append(exc)
        for canonical, backup in reversed(backups):
            try:
                os.replace(backup, canonical)
            except BaseException as exc:
                rollback_errors.append(exc)
        for failure in rollback_errors:
            original.add_note(f"Atomic publication rollback failed: {failure}")
        _cleanup(staged_paths, original)
        _cleanup([backup for _, backup in backups], original)
        raise

    # Once every replacement succeeds the generation is committed.  Backup
    # deletion is best effort and must not turn success into a rollback.
    _cleanup([backup for _, backup in backups])
