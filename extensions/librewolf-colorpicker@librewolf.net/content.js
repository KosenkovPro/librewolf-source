// The page side of the color picker. The pick itself is done by the
// EyeDropper api of the browser, the result is shown in an overlay that offers
// the three formats of the color.

const OVERLAY_ID = "librewolf-colorpicker-overlay";
const HUD_ID = "librewolf-colorpicker-hud";
const FORMAT_KEY = "librewolf-colorpicker-format";

const STYLES = `
  #${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    font-family: system-ui, sans-serif;
  }
  #${OVERLAY_ID} .lw-cp-box {
    background: #1c1b22;
    color: #fbfbfe;
    border: 1px solid #4a4a52;
    border-radius: 8px;
    padding: 16px;
    min-width: 280px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }
  #${OVERLAY_ID} .lw-cp-swatch {
    width: 100%;
    height: 90px;
    border-radius: 6px;
    border: 1px solid #4a4a52;
    margin-bottom: 12px;
  }
  #${OVERLAY_ID} .lw-cp-values {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    line-height: 1.7;
  }
  #${OVERLAY_ID} .lw-cp-values div { display: flex; justify-content: space-between; gap: 12px; }
  #${OVERLAY_ID} .lw-cp-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  #${OVERLAY_ID} button {
    flex: 1;
    padding: 7px 10px;
    border-radius: 5px;
    border: 1px solid #4a4a52;
    background: #2b2a33;
    color: #fbfbfe;
    cursor: pointer;
    font-size: 13px;
  }
  #${OVERLAY_ID} button:hover { background: #3a3944; }
  #${OVERLAY_ID} .lw-cp-done { background: #0060df; border-color: #0060df; }
  #${HUD_ID} {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: #1c1b22;
    color: #fbfbfe;
    border: 1px solid #4a4a52;
    border-radius: 20px;
    padding: 9px 18px;
    font: 13px system-ui, sans-serif;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
  }
`;

function ensureStyles() {
  if (document.getElementById("librewolf-colorpicker-styles")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "librewolf-colorpicker-styles";
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}

function removeNode(id) {
  document.getElementById(id)?.remove();
}

function showHud(text) {
  removeNode(HUD_ID);
  const hud = document.createElement("div");
  hud.id = HUD_ID;
  hud.textContent = text;
  document.documentElement.appendChild(hud);
}

function hideHud() {
  removeNode(HUD_ID);
}

function toRgb(srgbHex) {
  return {
    r: parseInt(srgbHex.slice(1, 3), 16),
    g: parseInt(srgbHex.slice(3, 5), 16),
    b: parseInt(srgbHex.slice(5, 7), 16),
  };
}

function toHsl(srgbHex) {
  const { r, g, b } = toRgb(srgbHex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function buildOverlay(srgbHex) {
  removeNode(OVERLAY_ID);
  const { r, g, b } = toRgb(srgbHex);
  const hsl = toHsl(srgbHex);

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="lw-cp-box">
      <div class="lw-cp-swatch" style="background:${srgbHex}"></div>
      <div class="lw-cp-values">
        <div><span>HEX</span><strong class="lw-cp-hex">${srgbHex.toUpperCase()}</strong></div>
        <div><span>RGB</span><strong class="lw-cp-rgb">rgb(${r}, ${g}, ${b})</strong></div>
        <div><span>HSL</span><strong class="lw-cp-hsl">hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)</strong></div>
      </div>
      <div class="lw-cp-actions">
        <button data-format="hex">Copy HEX</button>
        <button data-format="rgb">Copy RGB</button>
        <button data-format="hsl">Copy HSL</button>
      </div>
      <div class="lw-cp-actions">
        <button class="lw-cp-done">Close</button>
      </div>
    </div>
  `;

  const values = {
    hex: srgbHex.toUpperCase(),
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
  };

  overlay.querySelectorAll("button[data-format]").forEach((button) => {
    button.addEventListener("click", async () => {
      const format = button.dataset.format;
      await browser.storage.local.set({ [FORMAT_KEY]: format });
      await copyText(values[format]);
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = `Copy ${format.toUpperCase()}`;
      }, 1200);
    });
  });

  overlay.querySelector(".lw-cp-done").addEventListener("click", () => {
    removeNode(OVERLAY_ID);
  });

  document.documentElement.appendChild(overlay);
}

/**
 * Puts the color into the buffer of the system.
 *
 * The page cannot always do it by itself, the background page of the
 * extension does it, it is always allowed to write into the buffer.
 */
async function copyText(text) {
  await browser.runtime.sendMessage({ type: "librewolf-colorpicker-copy", text });
}

async function startPick(format) {
  if (typeof window.EyeDropper !== "function") {
    showHud("The EyeDropper api is not available in this build.");
    setTimeout(hideHud, 4000);
    return;
  }

  hideHud();
  showHud("Click on a color to pick it, Esc to cancel.");

  const onClick = async (event) => {
    // The page must not react to the click that starts the pick.
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener("click", onClick, true);
    hideHud();

    try {
      const result = await new window.EyeDropper().open();
      if (!result?.sRGBHex) {
        return;
      }
      buildOverlay(result.sRGBHex);
      await browser.storage.local.set({ [FORMAT_KEY]: format });
      await copyText(
        format === "rgb"
          ? `rgb(${toRgb(result.sRGBHex).r}, ${toRgb(result.sRGBHex).g}, ${toRgb(result.sRGBHex).b})`
          : format === "hsl"
            ? (() => {
                const h = toHsl(result.sRGBHex);
                return `hsl(${h.h}, ${h.s}%, ${h.l}%)`;
              })()
            : result.sRGBHex.toUpperCase(),
      );
    } catch (error) {
      // The pick was cancelled, there is nothing to report.
      console.debug("The color was not picked", error);
    }
  };

  document.addEventListener("click", onClick, true);
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "librewolf-colorpicker-start") {
    return undefined;
  }
  ensureStyles();
  startPick(message.format || "hex");
  return Promise.resolve({ started: true });
});
