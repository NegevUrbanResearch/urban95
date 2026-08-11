import math

from lib.urban95_status import (
    aggregate_status,
    attainment_from_score,
    equal_mean,
    status_from_attainment,
)


def test_status_boundaries_are_nearest_level_cutoffs():
    assert status_from_attainment(0.0) == "disappointing"
    assert status_from_attainment(0.249999) == "disappointing"
    assert status_from_attainment(0.25) == "functioning"
    assert status_from_attainment(0.749999) == "functioning"
    assert status_from_attainment(0.75) == "thriving"
    assert status_from_attainment(1.0) == "thriving"


def test_invalid_attainment_is_unknown():
    for value in (None, math.nan, -0.01, 1.01, "bad"):
        assert status_from_attainment(value) == "unknown"


def test_attainment_conversion_safely_rejects_exception_raising_sentinels():
    class Sentinel:
        def __float__(self):
            raise RuntimeError("not numeric")

    assert attainment_from_score(Sentinel()) is None
    assert status_from_attainment(Sentinel()) == "unknown"


def test_equal_mean_is_strict_about_unknown_children():
    assert equal_mean([0.0, 0.5, 1.0]) == 0.5
    assert equal_mean([1.0]) == 1.0
    assert equal_mean([]) is None
    assert equal_mean([1.0, None]) is None
    assert aggregate_status([1.0, 0.5, 0.0]) == "functioning"
    assert aggregate_status([1.0, None]) == "unknown"
