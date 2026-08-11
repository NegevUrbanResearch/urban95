(function () {
  var palette = window.Urban95Palette;
  if (!palette) {
    throw new Error("Urban95ScoreExplain requires Urban95Palette (load js/core/palette.js first)");
  }

  var SCORE_EXPLAIN_CLEAN_ICON_BY_KEY = {
    trees: "trees",
    parks: "park-access",
    playgrounds: "playgrounds",
    health: "health-services",
    education: "education",
    bus_stops: "bus-stops",
    shelters: "shelters",
    "community-centers": "community-centers",
    businesscenters: "business-centers",
    "street-lights": "street-lights",
  };

  var SCORE_EXPLAIN_ROW_ICON_BY_LABEL = {
    "Amenity POIs (count)": "shop",
    "Trees (\u00d7\u00bc)": "trees",
    "Street lights (\u00d7\u00bc)": "street-lights",
    "Trees (weighted)": "trees",
    "Other manifest-weighted": "marker",
  };

  var REQUIRED_SCORE_MODEL_MEMBERS = {
    CLEAN_SCORE_COMPONENTS: "array",
    CLEAN_WEIGHTS: "object",
    WEIGHTED_CATEGORY_COMPONENTS: "array",
    WEIGHTED_CATEGORY_BY_STEM: "object",
    WEIGHTED_SUBCATEGORY_COMPONENTS: "object",
    getAmenityConfig: "function",
    filterTypeToCleanWeightKey: "function",
    hasCleanPtsBreakdown: "function",
    cleanPtsPropertyName: "function",
    getFilteredContributionForType: "function",
    amenityTypeToBuildingStatKey: "function",
    getExpandedContributionForType: "function",
    formatScoreInteger: "function",
    formatMetricNumber: "function",
    computePercentileRank: "function",
  };

  function create(deps) {
    var validated = validateDeps(deps || null);
    var scoreModel = validated.scoreModel;
    var state = validated.state;
    var iconsBase = validated.iconsBase;
    var weightedIcons = window.Urban95WeightedIndicatorIcons.create(iconsBase);
    var iconNeutral = weightedIcons.ICON_NEUTRAL;

    function getWeightedCategoryIcon(stem) {
      return weightedIcons.getCategoryIcon(stem);
    }

    function getWeightedSubcategoryIcon(stem) {
      return weightedIcons.getSubcategoryIcon(stem);
    }

    function getCleanComponentIcon(key) {
      return SCORE_EXPLAIN_CLEAN_ICON_BY_KEY[key] || "marker";
    }

    function getScoreExplainRowIcon(row) {
      if (!row) return "marker";
      if (row.icon) return row.icon;
      if (row.amenityType) return scoreModel.getAmenityConfig(row.amenityType).icon;
      if (row.cleanKey) return getCleanComponentIcon(row.cleanKey);
      if (row.weightedStem) return getWeightedCategoryIcon(row.weightedStem);
      if (row.weightedSubStem) return getWeightedSubcategoryIcon(row.weightedSubStem);
      return SCORE_EXPLAIN_ROW_ICON_BY_LABEL[row.label] || "marker";
    }

    function renderHorizonIcon(iconName, color) {
      return weightedIcons.renderIcon(iconName, color);
    }

    function getScoreExplainRowIconColor(row, barColor) {
      if (!row) return iconNeutral;
      if (state.getScoreMode() === "weighted" && !row.amenityType && !row.cleanKey) {
        return barColor || palette.slate;
      }
      return iconNeutral;
    }

    function getScoreExplainPartialFilterSet() {
      var selected = state.getSelectedAmenityTypes();
      var allTypes = state.getAllFilterTypes();
      if (!selected || selected.size === 0 || selected.size === allTypes.length) return null;
      return selected;
    }

    function isScoreExplainRowFilterHighlighted(row) {
      var active = getScoreExplainPartialFilterSet();
      if (!active || !row) return false;
      if (row.amenityType) return active.has(row.amenityType);
      if (row.cleanKey) {
        var hit = false;
        active.forEach(function (type) {
          if (scoreModel.filterTypeToCleanWeightKey(type) === row.cleanKey) hit = true;
        });
        return hit;
      }
      if (row.label === "Trees (\u00d7\u00bc)" || row.label === "Trees (weighted)") {
        return active.has("trees");
      }
      if (row.label === "Street lights (\u00d7\u00bc)") return active.has("street-lights");
      return false;
    }

    function isScoreExplainCategoryFilterHighlighted(cat) {
      if (state.getScoreMode() === "weighted") {
        var metric = validated.getActiveMetric();
        if (!metric || !cat) return false;
        if (metric.selectedWeightedStem !== cat.stem) return false;
        return metric.kind === "weighted-category" || metric.kind === "weighted-subcategory";
      }
      var active = getScoreExplainPartialFilterSet();
      if (!active || !cat) return false;
      return active.has(cat.stem);
    }

    function parseColorChannels(color) {
      var text = String(color || "").trim();
      var rgb = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
      var hex = text.startsWith("#") ? text.slice(1) : text;
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length === 6 && /^[0-9a-f]+$/i.test(hex)) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
      return [37, 99, 235];
    }

    function channelsToCss(channels) {
      return "rgb(" + channels[0] + "," + channels[1] + "," + channels[2] + ")";
    }

    function mixChannels(channels, whiteMix) {
      var mix = Math.min(1, Math.max(0, whiteMix));
      return channels.map(function (channel) {
        return Math.round(channel + (255 - channel) * mix);
      });
    }

    function mixColorWithWhite(color, whiteMix) {
      return channelsToCss(mixChannels(parseColorChannels(color), whiteMix));
    }

    function horizonBarFillStyle(baseColor, widthPct) {
      var base = parseColorChannels(baseColor || palette.accent);
      var light = channelsToCss(mixChannels(base, 0.45));
      var full = channelsToCss(base);
      return (
        "width:" +
        widthPct +
        "%;background:linear-gradient(90deg," +
        light +
        " 0%," +
        full +
        " 100%)"
      );
    }

    function horizonSubBarFillStyle(parentColor, widthPct, subIndex, subCount) {
      var base = parseColorChannels(parentColor || palette.accent);
      var count = Math.max(1, subCount);
      var index = Math.max(0, Math.min(subIndex, count - 1));
      var subMix = count === 1 ? 0.32 : 0.5 - (index / (count - 1)) * 0.28;
      var sub = mixChannels(base, subMix);
      var light = mixChannels(sub, 0.18);
      return (
        "width:" +
        widthPct +
        "%;background:linear-gradient(90deg," +
        channelsToCss(light) +
        " 0%," +
        channelsToCss(sub) +
        " 100%)"
      );
    }

    function renderHorizonLabelCell(label, iconName, weightTagHtml, labelColor, opts) {
      opts = opts || {};
      var iconColor =
        opts.iconColor != null ? opts.iconColor : labelColor != null ? labelColor : palette.slate;
      var colorLabelText = opts.colorLabelText !== false && labelColor != null && labelColor !== "";
      var html = '<span class="horizon-label"';
      if (colorLabelText) html += ' style="color:' + escapeHtml(labelColor) + '"';
      html += ">";
      html += '<span class="horizon-label-top">';
      html += renderHorizonIcon(iconName, iconColor);
      html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
      html += "</span>";
      if (weightTagHtml) html += weightTagHtml;
      html += "</span>";
      return html;
    }

    function renderHorizonSubLabelCell(label, iconName, color) {
      var iconColor = color != null && color !== "" ? color : iconNeutral;
      var html = '<span class="horizon-sub-label"';
      if (color != null && color !== "") html += ' style="color:' + escapeHtml(color) + '"';
      html += ">";
      html += '<span class="horizon-label-top">';
      html += renderHorizonIcon(iconName, iconColor);
      html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
      html += "</span></span>";
      return html;
    }

    function buildFilteredFormulaLine(useAll) {
      if (!useAll) {
        return "Partial score (default manifest) = sum of manifest point contributions for each category you selected (from precomputed clean_pts_* columns when available).";
      }
      var terms = (scoreModel.CLEAN_SCORE_COMPONENTS || []).map(function (component) {
        var weight = scoreModel.CLEAN_WEIGHTS[component.key];
        return weight + " × (" + component.shortTag + ")";
      });
      return "Default score = " + terms.join(" + ");
    }

    function getSelectedTypesArray() {
      return Array.from(state.getSelectedAmenityTypes() || []);
    }

    function isUsingAllSelectedTypes(selectedTypes, allTypes) {
      return !!selectedTypes && selectedTypes.length > 0 && selectedTypes.length === allTypes.length;
    }

    function fillExplainSeries(series, features, minutes) {
      var explain = {};
      var explainAmenity = {};
      var suffix = "_" + minutes + "min";
      var allTypes = state.getAllFilterTypes();
      var selectedTypes = getSelectedTypesArray();
      var useAll = isUsingAllSelectedTypes(selectedTypes, allTypes);
      var activeTypes = useAll ? allTypes : selectedTypes;

      function pushMetric(id, getter) {
        var values = [];
        (features || []).forEach(function (feature) {
          values.push(getter((feature && feature.properties) || {}));
        });
        explain[id] = values;
      }

      if (state.getScoreMode() === "weighted") {
        series.explain = explain;
        series.explainAmenity = explainAmenity;
        return;
      }

      if (state.getScoreMode() === "clean") {
        if (useAll) {
          var sample = features && features.length > 0 ? features[0].properties || {} : {};
          if (scoreModel.hasCleanPtsBreakdown(sample, minutes)) {
            (scoreModel.CLEAN_SCORE_COMPONENTS || []).forEach(function (component) {
              var column = scoreModel.cleanPtsPropertyName(component.key, minutes);
              var metricId = "flt_pts_" + component.key.replace(/-/g, "_");
              pushMetric(metricId, function (props) {
                return Number(props[column]) || 0;
              });
            });
          } else {
            pushMetric("flt_tree_w", function (props) {
              return scoreModel.CLEAN_WEIGHTS.trees * (Number(props["num_trees" + suffix]) || 0);
            });
            pushMetric("flt_rest", function (props) {
              var totalScore = Number(props["score_clean" + suffix]) || 0;
              var treeWeighted =
                scoreModel.CLEAN_WEIGHTS.trees * (Number(props["num_trees" + suffix]) || 0);
              return totalScore - treeWeighted;
            });
          }
        } else {
          activeTypes.forEach(function (type) {
            var metricId = "flt_sel_" + type;
            pushMetric(metricId, function (props) {
              return scoreModel.getFilteredContributionForType(props, minutes, type);
            });
          });
        }
      } else {
        if (useAll) {
          pushMetric("exp_amen", function (props) {
            return Number(props["num_amenities" + suffix]) || 0;
          });
          pushMetric("exp_tree_w", function (props) {
            return (Number(props["num_trees" + suffix]) || 0) * 0.25;
          });
          pushMetric("exp_sl_w", function (props) {
            return (Number(props["num_street_lights" + suffix]) || 0) * 0.25;
          });
          allTypes
            .filter(function (type) {
              return type !== "trees" && type !== "street-lights";
            })
            .forEach(function (type) {
              var statKey = scoreModel.amenityTypeToBuildingStatKey(type);
              explainAmenity["exp_amen_" + statKey] = [];
            });
          (features || []).forEach(function (feature) {
            var props = (feature && feature.properties) || {};
            allTypes
              .filter(function (type) {
                return type !== "trees" && type !== "street-lights";
              })
              .forEach(function (type) {
                var statKey = scoreModel.amenityTypeToBuildingStatKey(type);
                explainAmenity["exp_amen_" + statKey].push(
                  Number(props["amen_" + statKey + suffix]) || 0
                );
              });
          });
        } else {
          activeTypes.forEach(function (type) {
            var metricId = "exp_sel_" + type;
            pushMetric(metricId, function (props) {
              return scoreModel.getExpandedContributionForType(props, minutes, type);
            });
          });
        }
      }

      series.explain = explain;
      series.explainAmenity = explainAmenity;
    }

    function getOrdinalSuffix(value) {
      var absolute = Math.abs(Number(value)) || 0;
      var mod100 = absolute % 100;
      if (mod100 >= 11 && mod100 <= 13) return "th";
      var mod10 = absolute % 10;
      if (mod10 === 1) return "st";
      if (mod10 === 2) return "nd";
      if (mod10 === 3) return "rd";
      return "th";
    }

    function formatScoreExplainRowValue(row) {
      var value = Number(row && row.value);
      if (Number.isFinite(value)) return scoreModel.formatScoreInteger(value);
      return row && row.valueLabel ? String(row.valueLabel).replace(/\s*pts\s*$/i, "").trim() : "";
    }

    function getPercentileSeriesForMinutes(minutes) {
      var cacheKey = state.getPercentileSeriesCacheKey(minutes);
      if (state.hasPercentileSeries(cacheKey)) {
        return state.getPercentileSeries(cacheKey);
      }

      var buildingsData = state.getBuildingsData();
      if (!buildingsData || !Array.isArray(buildingsData.features)) {
        return null;
      }

      var overall = [];
      buildingsData.features.forEach(function (feature) {
        overall.push(state.getBuildingOverallScore((feature && feature.properties) || {}, minutes));
      });

      var series = { overall: overall };
      fillExplainSeries(series, buildingsData.features, minutes);
      state.setPercentileSeries(cacheKey, series);
      return series;
    }

    function buildPercentileMetrics(buildingProps) {
      if (!buildingProps) return null;
      var overallScore = state.getBuildingOverallScore(buildingProps, state.getWalkMinutes());
      if (state.getScoreMode() === "weighted") {
        return { overallPercentile: null, overallScore: overallScore };
      }
      var selected = state.getSelectedAmenityTypes();
      if (!selected || selected.size === 0) return null;
      var series = getPercentileSeriesForMinutes(state.getWalkMinutes());
      if (!series || !series.overall || series.overall.length === 0) return null;
      return {
        overallPercentile: scoreModel.computePercentileRank(series.overall, overallScore),
        overallScore: overallScore,
      };
    }

    function percentileForSeries(values, value) {
      if (!values || values.length === 0) return null;
      return scoreModel.computePercentileRank(values, value);
    }

    function buildPartialCleanRows(rows, props, minutes, series, activeTypes) {
      activeTypes.forEach(function (type) {
        var value = scoreModel.getFilteredContributionForType(props, minutes, type);
        var config = scoreModel.getAmenityConfig(type);
        var weightKey = scoreModel.filterTypeToCleanWeightKey(type);
        var detail = "";
        if (type === "trees") {
          detail = "×" + scoreModel.CLEAN_WEIGHTS.trees + " per tree in range";
        } else if (type === "street-lights") {
          detail = "×" + scoreModel.CLEAN_WEIGHTS["street-lights"] + " per street light in range";
        }
        rows.push({
          label: config.label,
          amenityType: type,
          cleanKey: weightKey,
          detail: detail,
          value: value,
          valueLabel: scoreModel.formatMetricNumber(value) + " pts",
          percentile: percentileForSeries(series.explain["flt_sel_" + type], value),
        });
      });
    }

    function buildPartialExpandedRows(rows, props, minutes, suffix, series, activeTypes) {
      activeTypes.forEach(function (type) {
        var value = scoreModel.getExpandedContributionForType(props, minutes, type);
        if (type === "trees") {
          rows.push({
            label: "Trees (\u00d7\u00bc)",
            amenityType: type,
            detail: "",
            value: value,
            valueLabel: scoreModel.formatMetricNumber(value),
            percentile: percentileForSeries(series.explain["exp_sel_" + type], value),
          });
          return;
        }
        if (type === "street-lights") {
          rows.push({
            label: "Street lights (\u00d7\u00bc)",
            amenityType: type,
            detail: "",
            value: value,
            valueLabel: scoreModel.formatMetricNumber(value),
            percentile: percentileForSeries(series.explain["exp_sel_" + type], value),
          });
          return;
        }

        var statKey = scoreModel.amenityTypeToBuildingStatKey(type);
        var count = Number(props["amen_" + statKey + suffix]) || 0;
        var config = scoreModel.getAmenityConfig(type);
        rows.push({
          label: config.label,
          amenityType: type,
          detail: "",
          value: count,
          valueLabel: scoreModel.formatMetricNumber(count),
          percentile: percentileForSeries(series.explain["exp_sel_" + type], value),
        });
      });
    }

    function buildExplainScoreBreakdown(buildingProps) {
      var props = buildingProps || {};
      var minutes = state.getScoreMinutes();
      var suffix = "_" + minutes + "min";
      var selectedTypes = getSelectedTypesArray();
      var allTypes = state.getAllFilterTypes();
      var useAll = isUsingAllSelectedTypes(selectedTypes, allTypes);
      var activeTypes = useAll ? allTypes : selectedTypes;
      var overallScore = state.getBuildingOverallScore(props, minutes);
      var rows = [];
      var isWeighted = state.getScoreMode() === "weighted";
      var isClean = state.getScoreMode() === "clean";

      if (isWeighted) {
        var statusScale = window.Urban95StatusScale;
        if (!statusScale) {
          throw new Error("Urban95ScoreExplain requires Urban95StatusScale for Urban95 status details");
        }
        function statusDetail(value) {
          var token = statusScale.normalize(value);
          var definition = (statusScale.definitions || []).find(function (item) {
            return item.token === token;
          }) || { token: "unknown", label: "Unknown", color: "#9ca3af" };
          return { token: definition.token, label: definition.label, color: definition.color };
        }
        function evidenceRows(fields) {
          return (fields || []).reduce(function (rows, field) {
            var value = props[field.propertyKey];
            if (value === undefined || value === null || value === "") return rows;
            rows.push({
              label: field.label,
              value: value,
              unit: field.unit || "",
            });
            return rows;
          }, []);
        }
        var weightedCategories = [];
        (scoreModel.WEIGHTED_CATEGORY_COMPONENTS || []).forEach(function (component) {
          var categoryStatus = statusDetail(props["u95_status_" + component.stem + suffix]);
          var group = {
            stem: component.stem,
            label: component.label,
            color: component.color,
            status: categoryStatus,
            subrows: [],
          };
          (scoreModel.WEIGHTED_SUBCATEGORY_COMPONENTS[component.stem] || []).forEach(function (sub) {
            var detailRows = (scoreModel.WEIGHTED_DETAIL_COMPONENTS[sub.stem] || []).map(function (detail) {
              var detailEvidence = [];
              var detailValue = props[detail.buildingKey];
              if (detailValue !== undefined && detailValue !== null && detailValue !== "") {
                detailEvidence.push({ label: "Observed access", value: detailValue, unit: "" });
              }
              return {
                stem: detail.stem,
                label: detail.label,
                status: statusDetail(
                  props[
                    "u95_status_detail_" +
                      component.stem +
                      "_" +
                      sub.stem +
                      "_" +
                      detail.stem +
                      suffix
                  ]
                ),
                rawEvidence: detailEvidence,
              };
            });
            group.subrows.push({
              stem: sub.stem,
              label: sub.label,
              status: statusDetail(
                props["u95_status_sub_" + component.stem + "_" + sub.stem + suffix]
              ),
              rawEvidence: evidenceRows(sub.evidenceFields),
              details: detailRows,
            });
          });
          weightedCategories.push(group);
        });
        return {
          overallStatus: statusDetail(props["u95_status" + suffix]),
          activeStatus: (function () {
            var metric = typeof validated.getActiveMetric === "function" ? validated.getActiveMetric() : null;
            return metric && metric.buildingPropertyKey
              ? statusDetail(props[metric.buildingPropertyKey])
              : null;
          })(),
          overallPercentile: null,
          rows: [],
          weightedCategories: weightedCategories,
        };
      }

      var series = getPercentileSeriesForMinutes(state.getWalkMinutes());
      if (!series || !series.explain || !series.overall || series.overall.length === 0) return null;
      var overallPercentile = percentileForSeries(series.overall, overallScore);

      if (isClean) {
        rows.push({ sectionTitle: "Weighted components" });
        if (!useAll) {
          buildPartialCleanRows(rows, props, minutes, series, activeTypes);
        } else if (scoreModel.hasCleanPtsBreakdown(props, minutes)) {
          (scoreModel.CLEAN_SCORE_COMPONENTS || []).forEach(function (component) {
            var column = scoreModel.cleanPtsPropertyName(component.key, minutes);
            var value = Number(props[column]) || 0;
            var weight = scoreModel.CLEAN_WEIGHTS[component.key];
            var metricId = "flt_pts_" + component.key.replace(/-/g, "_");
            rows.push({
              label: component.label,
              cleanKey: component.key,
              detail: weight + " pts × (" + component.shortTag + ")",
              value: value,
              valueLabel: scoreModel.formatMetricNumber(value) + " pts",
              percentile: percentileForSeries(series.explain[metricId], value),
            });
          });
        } else {
          var treeWeighted =
            scoreModel.CLEAN_WEIGHTS.trees * (Number(props["num_trees" + suffix]) || 0);
          var rest = (Number(props["score_clean" + suffix]) || 0) - treeWeighted;
          rows.push({
            label: "Trees (weighted)",
            detail: "×" + scoreModel.CLEAN_WEIGHTS.trees + " per tree in range",
            value: treeWeighted,
            valueLabel: scoreModel.formatMetricNumber(treeWeighted) + " pts",
            percentile: percentileForSeries(series.explain.flt_tree_w, treeWeighted),
          });
          rows.push({
            label: "Other manifest-weighted",
            detail: "Regenerate data with python -m pipeline run score (or rescore) for a per-category breakdown.",
            value: rest,
            valueLabel: scoreModel.formatMetricNumber(rest) + " pts",
            percentile: percentileForSeries(series.explain.flt_rest, rest),
          });
        }
      } else {
        rows.push({ sectionTitle: "Main components" });
        if (!useAll) {
          buildPartialExpandedRows(rows, props, minutes, suffix, series, activeTypes);
        } else {
          var amenityCount = Number(props["num_amenities" + suffix]) || 0;
          var treeQuarter = (Number(props["num_trees" + suffix]) || 0) * 0.25;
          var streetLightQuarter = (Number(props["num_street_lights" + suffix]) || 0) * 0.25;
          rows.push({
            label: "Amenity POIs (count)",
            detail: "1 point per POI in range",
            value: amenityCount,
            valueLabel: scoreModel.formatMetricNumber(amenityCount),
            percentile: percentileForSeries(series.explain.exp_amen, amenityCount),
          });
          rows.push({
            label: "Trees (\u00d7\u00bc)",
            detail: "",
            value: treeQuarter,
            valueLabel: scoreModel.formatMetricNumber(treeQuarter),
            percentile: percentileForSeries(series.explain.exp_tree_w, treeQuarter),
          });
          rows.push({
            label: "Street lights (\u00d7\u00bc)",
            detail: "",
            value: streetLightQuarter,
            valueLabel: scoreModel.formatMetricNumber(streetLightQuarter),
            percentile: percentileForSeries(series.explain.exp_sl_w, streetLightQuarter),
          });

          var availableStatKeys = state.getBuildingAmenityStatKeysForMinutes(minutes);
          var amenityRows = [];
          allTypes
            .filter(function (type) {
              return type !== "trees" && type !== "street-lights";
            })
            .forEach(function (type) {
              var statKey = scoreModel.amenityTypeToBuildingStatKey(type);
              var metricId = "exp_amen_" + statKey;
              var values = series.explainAmenity[metricId];
              if (!values) return;
              var hasBuildingColumn = availableStatKeys.has(statKey);
              var count = hasBuildingColumn
                ? Number(props["amen_" + statKey + suffix]) || 0
                : Number(state.getLatestRadiusCounts()[type]) || 0;
              var config = scoreModel.getAmenityConfig(type);
              amenityRows.push({
                label: config.label,
                amenityType: type,
                detail: "",
                value: count,
                valueLabel: scoreModel.formatMetricNumber(count),
                percentile: hasBuildingColumn ? percentileForSeries(values, count) : null,
              });
            });
          amenityRows.sort(function (left, right) {
            if (right.value !== left.value) return right.value - left.value;
            return left.label.localeCompare(right.label);
          });
          if (amenityRows.length > 0) {
            rows.push({ sectionTitle: "POI categories (count in range)" });
            amenityRows.forEach(function (row) {
              rows.push(row);
            });
          }
        }
      }

      return {
        formulaLine: isClean
          ? buildFilteredFormulaLine(useAll)
          : useAll
            ? "Amenities Focus index = POI count + \u00bc× trees + \u00bc× street lights."
            : "Partial Amenities Focus index = sum of selected POI counts plus \u00bc× trees and \u00bc× lights when selected.",
        overallScoreLabel: scoreModel.formatMetricNumber(overallScore),
        overallPercentile: overallPercentile,
        rows: rows,
      };
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function explainRankBarColor(percentile) {
      if (percentile == null) return "#94a3b8";
      if (percentile >= 70) return "#22c55e";
      if (percentile >= 40) return palette.gold;
      return "#ef4444";
    }

    function heroPercentileMeterFillStyle(value0to100) {
      var value = Math.min(100, Math.max(0, Number(value0to100) || 0));
      return "width:" + value + "%;--meter-fill-pct:" + Math.max(1, value);
    }

    return {
      escapeHtml: escapeHtml,
      renderHorizonLabelCell: renderHorizonLabelCell,
      renderHorizonSubLabelCell: renderHorizonSubLabelCell,
      getWeightedCategoryIcon: getWeightedCategoryIcon,
      getWeightedSubcategoryIcon: getWeightedSubcategoryIcon,
      getScoreExplainRowIcon: getScoreExplainRowIcon,
      getScoreExplainRowIconColor: getScoreExplainRowIconColor,
      getScoreExplainPartialFilterSet: getScoreExplainPartialFilterSet,
      isScoreExplainCategoryFilterHighlighted: isScoreExplainCategoryFilterHighlighted,
      isScoreExplainRowFilterHighlighted: isScoreExplainRowFilterHighlighted,
      formatScoreExplainRowValue: formatScoreExplainRowValue,
      horizonBarFillStyle: horizonBarFillStyle,
      horizonSubBarFillStyle: horizonSubBarFillStyle,
      explainRankBarColor: explainRankBarColor,
      heroPercentileMeterFillStyle: heroPercentileMeterFillStyle,
      getOrdinalSuffix: getOrdinalSuffix,
      buildExplainScoreBreakdown: buildExplainScoreBreakdown,
      buildPercentileMetrics: buildPercentileMetrics,
      scoreExplainIconNeutral: iconNeutral,
    };
  }

  function validateDeps(deps) {
    if (!deps) {
      throw new Error("Urban95ScoreExplain.create requires deps");
    }
    if (!deps.scoreModel || typeof deps.scoreModel !== "object") {
      throw new Error("Urban95ScoreExplain.create requires scoreModel");
    }
    Object.keys(REQUIRED_SCORE_MODEL_MEMBERS).forEach(function (memberName) {
      var expectedType = REQUIRED_SCORE_MODEL_MEMBERS[memberName];
      var value = deps.scoreModel[memberName];
      var isValid = false;
      if (expectedType === "array") {
        isValid = Array.isArray(value);
      } else if (expectedType === "object") {
        isValid = !!value && typeof value === "object" && !Array.isArray(value);
      } else {
        isValid = typeof value === expectedType;
      }
      if (!isValid) {
        throw new Error(
          "Urban95ScoreExplain.create requires scoreModel." +
            memberName +
            " (" +
            expectedType +
            ")"
        );
      }
    });
    if (typeof deps.iconsBase !== "string" || deps.iconsBase === "") {
      throw new Error("Urban95ScoreExplain.create requires iconsBase");
    }
    if (!deps.state || typeof deps.state !== "object") {
      throw new Error("Urban95ScoreExplain.create requires state");
    }
    if (typeof deps.getActiveMetric !== "function") {
      throw new Error("Urban95ScoreExplain.create requires getActiveMetric");
    }
    [
      "getScoreMode",
      "getScoreMinutes",
      "getWalkMinutes",
      "getSelectedAmenityTypes",
      "getAllFilterTypes",
      "getBuildingsData",
      "getLatestRadiusCounts",
      "hasPercentileSeries",
      "getPercentileSeries",
      "setPercentileSeries",
      "getPercentileSeriesCacheKey",
      "getBuildingAmenityStatKeysForMinutes",
      "getBuildingOverallScore",
    ].forEach(function (memberName) {
      if (typeof deps.state[memberName] !== "function") {
        throw new Error("Urban95ScoreExplain.create requires state." + memberName);
      }
    });
    return deps;
  }

  window.Urban95ScoreExplain = { create: create };
})();
