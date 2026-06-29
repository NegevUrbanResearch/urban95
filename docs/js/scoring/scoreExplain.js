(function () {
  var SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS = {
    environmental_quality: "garden",
    nature: "park",
    play: "playground",
    safety_mobility: "bus",
    family_services: "heart",
  };

  var SCORE_EXPLAIN_WEIGHTED_SUB_ICONS = {
    shade: "park-alt1",
    trees: "park-alt1",
    roads: "road-accident",
    parks: "park",
    urban_nature_areas: "park-alt1",
    playgrounds: "playground",
    street_lights: "lighthouse",
    bicycle_access: "bicycle",
    bus_stops: "bus",
    shelters: "shelter",
    education: "school",
    community: "town-hall",
    business: "shop",
    health: "hospital",
  };

  var SCORE_EXPLAIN_CLEAN_ICON_BY_KEY = {
    trees: "park-alt1",
    parks: "park",
    playgrounds: "playground",
    health: "hospital",
    education: "school",
    bus_stops: "bus",
    shelters: "shelter",
    "community-centers": "town-hall",
    businesscenters: "shop",
    "street-lights": "lighthouse",
  };

  var SCORE_EXPLAIN_ROW_ICON_BY_LABEL = {
    "Amenity POIs (count)": "shop",
    "Trees (\u00d7\u00bc)": "park-alt1",
    "Street lights (\u00d7\u00bc)": "lighthouse",
    "Trees (weighted)": "park-alt1",
    "Other manifest-weighted": "marker",
  };

  var SCORE_EXPLAIN_ICON_NEUTRAL = "#0f172a";
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
    getPercentileSeriesCacheKey: "function",
    computePercentileRank: "function"
  };

  function create(deps) {
    var validated = validateDeps(deps || null);
    var scoreModel = validated.scoreModel;
    var state = validated.state;
    var iconsBase = validated.iconsBase;

    function getWeightedCategoryIcon(stem) {
      return SCORE_EXPLAIN_WEIGHTED_CATEGORY_ICONS[stem] || "marker";
    }

    function getWeightedSubcategoryIcon(stem) {
      return SCORE_EXPLAIN_WEIGHTED_SUB_ICONS[stem] || "marker";
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
      var name = iconName || "marker";
      var iconColor = color || "#64748b";
      var url = iconsBase + "/" + encodeURIComponent(name) + ".svg";
      return (
        '<span class="horizon-icon" role="img" aria-hidden="true" style="--horizon-icon-color:' +
        escapeHtml(iconColor) +
        ";--horizon-icon-url:url('" +
        url +
        "')\"></span>"
      );
    }

    function getScoreExplainRowIconColor(row, barColor) {
      if (!row) return SCORE_EXPLAIN_ICON_NEUTRAL;
      if (state.getScoreMode() === "weighted" && !row.amenityType && !row.cleanKey) {
        return barColor || "#64748b";
      }
      return SCORE_EXPLAIN_ICON_NEUTRAL;
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
      var base = parseColorChannels(baseColor || "#2563eb");
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
      var base = parseColorChannels(parentColor || "#2563eb");
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
        opts.iconColor != null ? opts.iconColor : labelColor != null ? labelColor : "#64748b";
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
      var iconColor = color != null && color !== "" ? color : SCORE_EXPLAIN_ICON_NEUTRAL;
      var html = '<span class="horizon-sub-label"';
      if (color != null && color !== "") html += ' style="color:' + escapeHtml(color) + '"';
      html += ">";
      html += '<span class="horizon-label-top">';
      html += renderHorizonIcon(iconName, iconColor);
      html += '<span class="horizon-label-text">' + escapeHtml(label) + "</span>";
      html += "</span></span>";
      return html;
    }

    function getSelectedWeightedCategoryStem() {
      if (state.getScoreMode() !== "weighted") return null;
      var selected = state.getSelectedAmenityTypes();
      if (!selected || selected.size !== 1) return null;
      var stem = Array.from(selected)[0];
      return scoreModel.WEIGHTED_CATEGORY_BY_STEM[stem] ? stem : null;
    }

    function getSelectedWeightedCategoryLabel() {
      var stem = getSelectedWeightedCategoryStem();
      if (!stem) return "Urban95";
      var component = scoreModel.WEIGHTED_CATEGORY_BY_STEM[stem];
      return component ? component.label : "Urban95";
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

    function fillExplainSeries(series, features, minutes) {
      var explain = {};
      var explainAmenity = {};
      var suffix = "_" + minutes + "min";
      var selected = state.getSelectedAmenityTypes();
      var allTypes = state.getAllFilterTypes();
      var useAll = !selected || selected.size === allTypes.length;
      var activeTypes = useAll ? allTypes : Array.from(selected);

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

    function renderWeightedSubcategoryComparisonList(container, rows) {
      if (!container) return;
      var ordered = (rows || []).slice().sort(function (left, right) {
        return right.neighborhood - left.neighborhood;
      });
      if (ordered.length === 0) {
        container.innerHTML = '<p class="score-explain-empty">Subcategory comparison data unavailable.</p>';
        return;
      }
      var html =
        '<div class="u95-compare-legend"><span class="u95-compare-legend-bar">Neighborhood</span><span class="u95-compare-legend-line">City avg</span></div>';
      html += '<div class="u95-compare-list">';
      ordered.forEach(function (row) {
        var neighborhood = Math.max(0, Math.min(100, Number(row.neighborhood) || 0));
        var city = Math.max(0, Math.min(100, Number(row.city) || 0));
        var color = neighborhood >= 70 ? "#22c55e" : neighborhood >= 40 ? "#eab308" : "#ef4444";
        html += '<div class="u95-compare-item">';
        html += '<div class="u95-compare-name">' + escapeHtml(row.label) + "</div>";
        html += '<div class="u95-compare-bar-wrap">';
        html += '<div class="u95-compare-city-marker" style="left:' + city + '%"></div>';
        html +=
          '<div class="u95-compare-bar" style="width:' +
          neighborhood +
          "%;background:" +
          color +
          '"></div>';
        html += "</div>";
        html +=
          '<div class="u95-compare-score"><strong>' +
          scoreModel.formatMetricNumber(neighborhood) +
          "</strong><span>city avg " +
          scoreModel.formatMetricNumber(city) +
          "</span></div>";
        html += "</div>";
      });
      html += "</div>";
      container.innerHTML = html;
    }

    function getPercentileSeriesForMinutes(minutes) {
      var cacheKey = scoreModel.getPercentileSeriesCacheKey(minutes, {
        scoreMode: state.getScoreMode(),
        selectedAmenityTypes: Array.from(state.getSelectedAmenityTypes() || []),
        allFilterTypes: state.getAllFilterTypes(),
      });
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
      var selected = state.getSelectedAmenityTypes();
      if (!selected || selected.size === 0) return null;
      var overallScore = state.getBuildingOverallScore(buildingProps, state.getWalkMinutes());
      if (state.getScoreMode() === "weighted") {
        return { overallPercentile: null, overallScore: overallScore };
      }
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

    function buildExplainScoreBreakdown(buildingProps) {
      var props = buildingProps || {};
      var minutes = state.getScoreMinutes();
      var suffix = "_" + minutes + "min";
      var selected = state.getSelectedAmenityTypes();
      var allTypes = state.getAllFilterTypes();
      var useAll = selected && selected.size === allTypes.length;
      var overallScore = state.getBuildingOverallScore(props, minutes);
      var rows = [];
      var isWeighted = state.getScoreMode() === "weighted";
      var isClean = state.getScoreMode() === "clean";

      if (isWeighted) {
        var weightedCategories = [];
        (scoreModel.WEIGHTED_CATEGORY_COMPONENTS || []).forEach(function (component) {
          var column = "score_weighted_" + component.stem + suffix;
          var value = Number(props[column]) || 0;
          var group = {
            stem: component.stem,
            label: component.label,
            weight: component.weight,
            value: value,
            valueLabel: scoreModel.formatMetricNumber(value) + " / 100",
            color: component.color,
            subrows: [],
          };
          (scoreModel.WEIGHTED_SUBCATEGORY_COMPONENTS[component.stem] || []).forEach(function (sub) {
            var subColumn = "score_weighted_sub_" + component.stem + "_" + sub.stem + suffix;
            var raw = props[subColumn];
            var hasValue = raw !== undefined && raw !== null && raw !== "";
            var subValue = hasValue ? Number(raw) || 0 : null;
            group.subrows.push({
              stem: sub.stem,
              label: sub.label,
              weight: sub.weight,
              totalWeight: sub.weight * component.weight,
              value: subValue,
              valueLabel:
                subValue != null
                  ? scoreModel.formatMetricNumber(subValue) + " / 100"
                  : "Missing (re-run preprocess)",
            });
          });
          weightedCategories.push(group);
        });
        return {
          formulaLine:
            "Urban95 score = (0.20×Environmental Quality) + (0.15×Nature) + (0.15×Play) + (0.25×Safety & Mobility) + (0.25×Family Services).",
          overallScoreLabel: scoreModel.formatMetricNumber(overallScore),
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
        if (scoreModel.hasCleanPtsBreakdown(props, minutes)) {
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
            detail: "Regenerate data with preprocess_accessibility.py for a per-category breakdown.",
            value: rest,
            valueLabel: scoreModel.formatMetricNumber(rest) + " pts",
            percentile: percentileForSeries(series.explain.flt_rest, rest),
          });
        }
      } else {
        rows.push({ sectionTitle: "Main components" });
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
      if (percentile >= 40) return "#eab308";
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
      renderWeightedSubcategoryComparisonList: renderWeightedSubcategoryComparisonList,
      getSelectedWeightedCategoryStem: getSelectedWeightedCategoryStem,
      getSelectedWeightedCategoryLabel: getSelectedWeightedCategoryLabel,
      scoreExplainIconNeutral: SCORE_EXPLAIN_ICON_NEUTRAL,
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
