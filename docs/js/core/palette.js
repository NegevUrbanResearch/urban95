(function () {
  // Single source of truth for brand / indicator colors.
  // CSS custom properties are applied here; edit this file to retheme the app.
  var coral = "#e05a56";
  var peach = "#d9944f";
  var yellow = "#d4c44a";
  var gold = "#eab308";
  var mint = "#5dcc62";
  var sage = "#4a9e49";
  var sky = "#3aade0";
  var blue = "#5a84f5";
  var lavender = "#8f5ce8";
  var orchid = "#e05ee3";

  var accentDeep = "#3f6ae8";
  var accentInk = "#3556b0";
  var heroFrom = "#4a62b8";

  var slate = "#64748b";
  var gray = "#6b7280";
  var ink = "#0f172a";

  var palette = {
    coral: coral,
    peach: peach,
    yellow: yellow,
    gold: gold,
    mint: mint,
    sage: sage,
    sky: sky,
    blue: blue,
    lavender: lavender,
    orchid: orchid,

    accent: blue,
    accentSoft: sky,
    accentDeep: accentDeep,
    accentInk: accentInk,
    heroFrom: heroFrom,
    heroTo: blue,

    slate: slate,
    gray: gray,
    ink: ink,
  };

  var CSS_VARS = [
    ["--palette-coral", coral],
    ["--palette-peach", peach],
    ["--palette-yellow", yellow],
    ["--palette-gold", gold],
    ["--palette-mint", mint],
    ["--palette-sage", sage],
    ["--palette-sky", sky],
    ["--palette-blue", blue],
    ["--palette-lavender", lavender],
    ["--palette-orchid", orchid],
    ["--app-accent", blue],
    ["--app-accent-soft", sky],
    ["--app-accent-deep", accentDeep],
    ["--app-accent-ink", accentInk],
    ["--app-hero-from", heroFrom],
    ["--app-hero-to", blue],
  ];

  function applyCssVariables(root) {
    var el = root || (typeof document !== "undefined" ? document.documentElement : null);
    if (!el || !el.style) return;
    for (var i = 0; i < CSS_VARS.length; i++) {
      el.style.setProperty(CSS_VARS[i][0], CSS_VARS[i][1]);
    }
  }

  function syncThemeColorMeta() {
    if (typeof document === "undefined") return;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", palette.accent);
  }

  applyCssVariables();
  syncThemeColorMeta();

  palette.applyCssVariables = applyCssVariables;
  palette.syncThemeColorMeta = syncThemeColorMeta;

  window.Urban95Palette = palette;
})();
