from __future__ import annotations

import copy
from types import SimpleNamespace

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, box

from lib.amenity_layers import PreparedAmenityLayers, prepare_amenity_layers
from lib import urban95_weights
from stages import amenity_metrics, urban95_scoring


def _frame(values):
    return gpd.GeoDataFrame(
        {"amenity_type": values},
        geometry=[Point(float(i), 0.0) for i in range(len(values))],
        crs="EPSG:2039",
    )


def _clean_contract_frame():
    return gpd.GeoDataFrame(
        {
            "amenity_type": ["education", "education", "health", "health", "playgrounds"],
            "amenity_subtype": ["school", "kindergarten", "clinic", "tipat_halav", None],
        },
        geometry=[Point(float(i), 0.0) for i in range(5)],
        crs="EPSG:2039",
    )


def test_prepare_amenity_layers_returns_explicit_frames_without_mutation(monkeypatch):
    legacy = _frame(["playground"])
    clean = _frame(["education"])
    trees = _frame([])
    parks = _frame([])
    lights = _frame(["street-lights"])
    before = [copy.deepcopy(frame) for frame in (legacy, clean, trees, parks, lights)]
    monkeypatch.setattr(
        "lib.amenity_layers.load_amenity_layers",
        lambda crs: (legacy, clean, trees, parks, lights, None),
    )
    monkeypatch.setattr(
        "lib.amenity_layers.prepare_legacy_amenities",
        lambda frame, merged_path, crs: (frame, "amenity_type"),
    )

    prepared = prepare_amenity_layers(2039)
    assert isinstance(prepared, PreparedAmenityLayers)
    assert prepared.amenities_legacy is legacy
    assert prepared.amenities_clean is clean
    assert prepared.trees is trees
    assert prepared.parks is parks
    assert prepared.street_lights is lights
    for frame, expected in zip((legacy, clean, trees, parks, lights), before):
        pd.testing.assert_frame_equal(frame, expected)


def test_amenity_stage_forwards_prepared_layers(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {"building_id": [1]}, geometry=[Point(0, 0)], crs="EPSG:2039"
    )
    prepared = PreparedAmenityLayers(*([_frame([])] * 5))
    seen = []

    monkeypatch.setattr(
        amenity_metrics,
        "run_amenity_metrics",
        lambda frame, *, isochrones=None, prepared_layers=None: seen.append(prepared_layers) or frame,
    )
    result = amenity_metrics.run_amenity_metrics_stage(
        buildings=buildings,
        isochrones=gpd.GeoDataFrame(geometry=[], crs="EPSG:2039"),
        write_output=False,
        prepared_layers=prepared,
    )
    assert seen == [prepared]
    assert result.equals(buildings)


def test_run_score_forwards_explicit_scoring_overrides(monkeypatch):
    buildings = gpd.GeoDataFrame(
        {"building_id": [1]}, geometry=[Point(0, 0)], crs="EPSG:2039"
    )
    overrides = urban95_scoring.ScoringLayerOverrides(
        trees=_frame([]), parks=_frame([]), street_lights=_frame([]), amenities_clean=_frame([])
    )
    seen = []
    monkeypatch.setattr(urban95_scoring, "_drop_stale_score_columns", lambda frame: frame)
    monkeypatch.setattr(
        urban95_scoring,
        "append_weighted_urban95_scores",
        lambda frame, *, shade_si_dir=None, workers=None, reused_layers=None: seen.append(reused_layers) or frame,
    )
    result = urban95_scoring.run_score(
        buildings=buildings,
        write_output=False,
        reused_layers=overrides,
    )
    assert seen == [overrides]
    assert result is buildings


def test_scoring_layer_builder_skips_only_explicit_override_reads(monkeypatch):
    trees = _frame(["tree"])
    parks = _frame(["park"])
    lights = _frame(["street-lights"])
    clean = _clean_contract_frame()
    disk_loads = []

    def fake_load_optional(layer_id, target_epsg):
        disk_loads.append(layer_id)
        return _frame([])

    monkeypatch.setattr(urban95_weights, "_load_optional_raw", fake_load_optional)
    monkeypatch.setattr(
        urban95_weights,
        "layer",
        lambda layer_id: (_ for _ in ()).throw(AssertionError(f"unexpected disk layer lookup: {layer_id}")),
    )
    layers = urban95_weights.build_layers_from_raw(
        target_epsg=2039,
        trees=trees,
        parks=parks,
        street_lights=lights,
        amenities_clean=clean,
    )

    assert disk_loads == ["roads", "urban_nature_areas", "bus_stops"]
    assert layers["trees"] is trees
    assert layers["parks"] is parks
    assert layers["street_lights"] is lights
    assert layers["education"]["amenity_type"].tolist() == ["education", "education"]
    assert layers["playgrounds"]["amenity_type"].tolist() == ["playgrounds"]


def test_scoring_layer_builder_keeps_standalone_disk_fallbacks(monkeypatch, tmp_path):
    disk_loads = []
    layer_lookups = []

    def fake_load_optional(layer_id, target_epsg):
        disk_loads.append(layer_id)
        return _frame([])

    def fake_layer(layer_id):
        layer_lookups.append(layer_id)
        return SimpleNamespace(path=tmp_path / f"missing-{layer_id}.geojson")

    monkeypatch.setattr(urban95_weights, "_load_optional_raw", fake_load_optional)
    monkeypatch.setattr(urban95_weights, "layer", fake_layer)
    urban95_weights.build_layers_from_raw(target_epsg=2039)

    assert disk_loads == list(urban95_weights.OPTIONAL_RAW_LAYER_IDS)
    assert layer_lookups == ["amenities_clean"]


def test_amenity_metrics_consumer_does_not_mutate_supplied_frames():
    buildings = gpd.GeoDataFrame(
        {"building_id": [1]}, geometry=[Point(0, 0)], crs="EPSG:2039"
    )
    isochrones = gpd.GeoDataFrame(
        {"building_id": [1], "minutes": [5]},
        geometry=[box(-10, -10, 10, 10)],
        crs="EPSG:2039",
    )
    prepared = PreparedAmenityLayers(
        amenities_legacy=_frame(["playground"]),
        amenities_clean=_frame(["education"]),
        trees=_frame(["tree"]),
        parks=_frame(["park"]),
        street_lights=_frame(["street-lights"]),
    )
    supplied = [
        prepared.amenities_legacy,
        prepared.amenities_clean,
        prepared.trees,
        prepared.parks,
        prepared.street_lights,
    ]
    snapshots = [copy.deepcopy(frame) for frame in supplied]

    amenity_metrics.run_amenity_metrics(
        buildings,
        isochrones=isochrones,
        prepared_layers=prepared,
    )

    for frame, snapshot in zip(supplied, snapshots):
        pd.testing.assert_frame_equal(frame, snapshot)


def test_scoring_consumer_does_not_mutate_supplied_frames(monkeypatch):
    trees = _frame(["tree"])
    parks = _frame(["park"])
    lights = _frame(["street-lights"])
    clean = _frame(["education"])
    supplied = [trees, parks, lights, clean]
    snapshots = [copy.deepcopy(frame) for frame in supplied]
    overrides = urban95_scoring.ScoringLayerOverrides(
        trees=trees,
        parks=parks,
        street_lights=lights,
        amenities_clean=clean,
    )
    empty = _frame([])

    def fake_build_layers(
        *, shade_si_dir, target_epsg, trees, parks, street_lights, amenities_clean
    ):
        assert trees is overrides.trees
        assert parks is overrides.parks
        assert street_lights is overrides.street_lights
        assert amenities_clean is overrides.amenities_clean
        return {
            "trees": trees,
            "roads": empty,
            "parks": parks,
            "urban_nature_areas": empty,
            "playgrounds": empty,
            "bikes": empty,
            "bus_stops": empty,
            "shelters": empty,
            "education": amenities_clean,
            "community": empty,
            "business": empty,
            "health": empty,
            "street_lights": street_lights,
            "shade_streets": None,
            "shade_open_spaces": None,
        }

    monkeypatch.setattr(urban95_scoring, "build_layers", fake_build_layers)
    buildings = gpd.GeoDataFrame(geometry=[Point(0, 0)], crs="EPSG:2039")
    urban95_scoring.append_weighted_urban95_scores(
        buildings,
        workers=1,
        reused_layers=overrides,
    )

    for frame, snapshot in zip(supplied, snapshots):
        pd.testing.assert_frame_equal(frame, snapshot)
