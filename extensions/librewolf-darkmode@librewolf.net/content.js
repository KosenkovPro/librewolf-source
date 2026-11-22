// The page side of the dark mode. The colors of the page are inverted and the
// elements that carry colors of their own are inverted back, the same way the
// dark mode of the readers does it.

const STYLE_ID = "librewolf-darkmode-style";

const STYLE = `
html.lw-dark {
  filter: invert(1) hue-rotate(180deg)
          brightness(var(--lw-brightness, 1)) contrast(var(--lw-contrast, 1)) !important;
  background-color: #fff !important;
}
html.lw-dark body {
  background-color: #fff !important;
}
html.lw-dark img,
html.lw-dark video,
html.lw-dark canvas,
html.lw-dark svg:not(:root),
html.lw-dark picture,
html.lw-dark iframe,
html.lw-dark embed,
html.lw-dark object,
html.lw-dark [style*="background-image"],
html.lw-dark [style*="background: url"] {
  filter: invert(1) hue-rotate(180deg)
          brightness(var(--lw-brightness, 1)) contrast(var(--lw-contrast, 1)) !important;
}
html.lw-dark [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
  }
}

function apply(enabled, brightness, contrast) {
  const root = document.documentElement;
  if (!root) {
    return;
  }

  if (!enabled) {
    root.classList.remove("lw-dark");
    root.style.removeProperty("--lw-brightness");
    root.style.removeProperty("--lw-contrast");
    return;
  }

  ensureStyle();
  root.classList.add("lw-dark");
  root.style.setProperty("--lw-brightness", String(brightness ?? 1));
  root.style.setProperty("--lw-contrast", String(contrast ?? 1));
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "librewolf-darkmode-apply") {
    return undefined;
  }
  apply(message.enabled, message.brightness, message.contrast);
  return Promise.resolve({ ok: true });
});
