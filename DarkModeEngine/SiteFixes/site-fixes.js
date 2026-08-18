(() => {
  "use strict";

  const fixes = Object.freeze([
    Object.freeze({
      id: "preserve-document-canvas",
      matches: (hostname) => hostname === "docs.google.com" || hostname.endsWith(".docs.google.com"),
      css: "canvas, [role='canvas'] { filter: none !important; }"
    }),
    Object.freeze({
      id: "preserve-map-tiles",
      matches: (hostname) => hostname === "maps.google.com" || hostname.endsWith(".openstreetmap.org"),
      css: "canvas, img[src*='tile'] { filter: none !important; opacity: 1 !important; }"
    })
  ]);

  function matchingCSS(hostname) {
    if (typeof hostname !== "string") return "";
    return fixes.filter((fix) => fix.matches(hostname)).map((fix) => fix.css).join("\n");
  }

  globalThis.PRISMSiteFixes = Object.freeze({ fixes, matchingCSS });
})();

