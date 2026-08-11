(function () {
  var DEFINITIONS = [
    { token: "disappointing", label: "Disappointing", color: "#ef4444" },
    { token: "functioning", label: "Functioning", color: "#eab308" },
    { token: "thriving", label: "Thriving", color: "#22c55e" },
    { token: "unknown", label: "Unknown", color: "#9ca3af" },
  ];
  var byToken = Object.fromEntries(DEFINITIONS.map(function (item) { return [item.token, item]; }));

  function normalize(value) {
    var token = String(value || "").trim().toLowerCase();
    return byToken[token] ? token : "unknown";
  }

  function labels() {
    return DEFINITIONS.map(function (item) { return item.label; });
  }

  function legendSpec(title) {
    return { title: title || "Status", scale: "status", items: DEFINITIONS.slice() };
  }

  function matchExpression(valueExpression) {
    return ["match", valueExpression,
      "disappointing", "#ef4444",
      "functioning", "#eab308",
      "thriving", "#22c55e",
      "#9ca3af"];
  }

  window.Urban95StatusScale = {
    normalize: normalize,
    labels: labels,
    legendSpec: legendSpec,
    matchExpression: matchExpression,
    definitions: DEFINITIONS.slice(),
  };
})();
