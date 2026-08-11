"""Load and normalize amenity layers for scoring and web export."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import geopandas as gpd
import pandas as pd

from core.geo_io import CRS_METRIC, load_layer, repair_dataframe_encoding
from core.paths import layer


@dataclass(frozen=True)
class PreparedAmenityLayers:
    """Explicit metric-CRS amenity frames shared by run-all stage handoffs."""

    amenities_legacy: gpd.GeoDataFrame
    amenities_clean: gpd.GeoDataFrame
    trees: gpd.GeoDataFrame | None
    parks: gpd.GeoDataFrame | None
    street_lights: gpd.GeoDataFrame | None


def normalize_clean_amenity_key(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip().lower().replace(" ", "_")


ALLOWED_AMENITY_SUBTYPES = {
    "education": frozenset({"school", "kindergarten"}),
    "health": frozenset({"clinic", "tipat_halav"}),
}


def normalize_amenity_subtype(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value)


def validate_clean_amenity_subtypes(frame: gpd.GeoDataFrame) -> None:
    if frame.empty:
        raise ValueError("amenities_clean is empty")
    if "amenity_type" not in frame.columns:
        raise ValueError("amenities_clean is missing amenity_type")
    parent = frame["amenity_type"].map(normalize_clean_amenity_key)
    subtype = (
        frame["amenity_subtype"].map(normalize_amenity_subtype)
        if "amenity_subtype" in frame.columns
        else pd.Series("", index=frame.index, dtype=object)
    )
    for parent_type, allowed in ALLOWED_AMENITY_SUBTYPES.items():
        affected = parent == parent_type
        invalid = affected & ~subtype.isin(allowed)
        if invalid.any():
            values = subtype.loc[invalid].value_counts(dropna=False).to_dict()
            raise ValueError(
                f"Invalid amenity_subtype for {parent_type}: {values}; "
                f"expected one of {sorted(allowed)}"
            )
        present = set(subtype.loc[affected])
        missing = allowed - present
        if missing:
            missing_counts = {
                value: int((subtype.loc[affected] == value).sum())
                for value in sorted(missing)
            }
            raise ValueError(
                f"Missing required amenity_subtype for {parent_type}: {sorted(missing)}; "
                f"affected parent records={int(affected.sum())}; "
                f"missing subtype counts={missing_counts}"
            )


def append_shelters_from_merged_to_legacy(
    amenities_legacy: gpd.GeoDataFrame,
    merged_path,
    crs_metric: int,
    amenity_type_column: str,
) -> gpd.GeoDataFrame:
    """Add shelter points from amenities_clean into the legacy amenity set."""
    if not merged_path.is_file():
        return amenities_legacy
    merged = gpd.read_file(merged_path)
    if merged.crs is None:
        merged.set_crs(epsg=4326, inplace=True)
    merged = repair_dataframe_encoding(merged)
    merged = merged.to_crs(epsg=crs_metric)
    if "amenity_type" not in merged.columns:
        return amenities_legacy
    shelters = merged[merged["amenity_type"].map(normalize_clean_amenity_key) == "shelters"].copy()
    if len(shelters) == 0:
        return amenities_legacy
    shelters["amenity_type"] = "shelters"
    if len(amenities_legacy) == 0:
        if amenity_type_column not in shelters.columns:
            shelters[amenity_type_column] = "shelters"
        return shelters
    for col in amenities_legacy.columns:
        if col == amenities_legacy.geometry.name:
            continue
        if col not in shelters.columns:
            shelters[col] = None
    shelters = shelters[amenities_legacy.columns]
    out = gpd.GeoDataFrame(
        pd.concat([amenities_legacy, shelters], ignore_index=True),
        crs=amenities_legacy.crs,
    )
    logging.info("Appended %d shelter points from merged manifest to legacy amenities.", len(shelters))
    return out


def load_amenity_layers(crs_metric: int = CRS_METRIC):
    amenities_legacy = gpd.GeoDataFrame()
    legacy_path = layer("amenities_legacy").path
    if legacy_path.is_file():
        amenities_legacy = load_layer(legacy_path, target_crs=crs_metric)
        logging.info("Repairing text encoding on legacy amenities (Hebrew/Arabic)...")
        amenities_legacy = repair_dataframe_encoding(amenities_legacy)
    else:
        logging.info("metric omitted: amenities_legacy")
        logging.warning("Missing amenities_legacy — expanded scores will be zero.")

    clean_parts = []
    merged_path = layer("amenities_clean").path
    street_lights_gdf = None
    sl_path = layer("street_lights").path
    if not merged_path.is_file():
        logging.info("metric omitted: amenities_clean")
    if merged_path.is_file():
        merged = gpd.read_file(merged_path)
        if merged.crs is None:
            merged.set_crs(epsg=4326, inplace=True)
        merged = repair_dataframe_encoding(merged)
        validate_clean_amenity_subtypes(merged)
        merged = merged.to_crs(epsg=crs_metric)
        clean_parts.append(merged)
        logging.info("Loaded amenities_clean: %s (%d features)", merged_path.name, len(merged))
    if sl_path.is_file():
        sl = gpd.read_file(sl_path)
        if sl.crs is None:
            sl.set_crs(epsg=4326, inplace=True)
        sl = repair_dataframe_encoding(sl)
        street_lights_gdf = sl.to_crs(epsg=crs_metric)
        logging.info("Loaded street lights: %s (%d features)", sl_path.name, len(street_lights_gdf))
    else:
        logging.info("metric omitted: street_lights")

    amenities_clean = gpd.GeoDataFrame()
    if clean_parts:
        amenities_clean = gpd.GeoDataFrame(
            pd.concat(clean_parts, ignore_index=True),
            crs=f"EPSG:{crs_metric}",
        )

    trees_gdf = None
    trees_path = layer("trees").path
    if trees_path.is_file():
        try:
            trees_gdf = load_layer(trees_path, target_crs=crs_metric)
        except Exception as exc:
            logging.warning("Could not load trees: %s", exc)
    else:
        logging.info("metric omitted: trees")

    parks_gdf = None
    parks_path = layer("parks").path
    if parks_path.is_file():
        try:
            parks_gdf = load_layer(parks_path, target_crs=crs_metric)
        except Exception as exc:
            logging.warning("Could not load parks: %s", exc)
    else:
        logging.info("metric omitted: parks")

    return amenities_legacy, amenities_clean, trees_gdf, parks_gdf, street_lights_gdf, merged_path


def prepare_amenity_layers(crs_metric: int = CRS_METRIC) -> PreparedAmenityLayers:
    """Load and normalize all amenity frames once for explicit stage reuse."""
    (
        amenities_legacy,
        amenities_clean,
        trees,
        parks,
        street_lights,
        merged_path,
    ) = load_amenity_layers(crs_metric)
    amenities_legacy, _ = prepare_legacy_amenities(
        amenities_legacy,
        merged_path,
        crs_metric,
    )
    return PreparedAmenityLayers(
        amenities_legacy=amenities_legacy,
        amenities_clean=amenities_clean,
        trees=trees,
        parks=parks,
        street_lights=street_lights,
    )


def prepare_legacy_amenities(
    amenities_legacy: gpd.GeoDataFrame,
    merged_path,
    crs_metric: int,
    amenity_type_column: str = "amenity_type",
) -> tuple[gpd.GeoDataFrame, str]:
    legacy_type_col = amenity_type_column
    if len(amenities_legacy) > 0:
        if legacy_type_col not in amenities_legacy.columns:
            if legacy_type_col != "top_classi" and "top_classi" in amenities_legacy.columns:
                logging.warning(
                    "Legacy amenities missing '%s'; falling back to 'top_classi'.",
                    legacy_type_col,
                )
                legacy_type_col = "top_classi"
            else:
                raise KeyError(f"Expected column '{legacy_type_col}' in legacy amenities layer.")

        amenities_legacy = amenities_legacy.copy()
        amenities_legacy["amenity_type"] = (
            amenities_legacy[legacy_type_col]
            .astype(str)
            .str.strip()
            .str.lower()
            .str.replace(" ", "_", regex=False)
            .str.replace("/", "_", regex=False)
            .replace({"nan": None})
        )
        amenities_legacy = amenities_legacy[~amenities_legacy["amenity_type"].isna()]

    amenities_legacy = append_shelters_from_merged_to_legacy(
        amenities_legacy, merged_path, crs_metric, legacy_type_col
    )
    return amenities_legacy, legacy_type_col
