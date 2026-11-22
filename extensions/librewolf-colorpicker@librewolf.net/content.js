// The page side of the color picker.
//
// The background page of the extension sends the picture of the visible part of
// the tab, this script shows it, the mouse picks the pixel of it and the color
// of the pixel is shown in the three formats and is copied into the buffer.

const OVERLAY_ID = "librewolf-colorpicker-overlay";
const FORMAT_KEY = "librewolf-colorpicker-format";

/** How much the loupe magnifies the pixels of the picture. */
const ZOOM = 8;
/** The size of the loupe in the pixels of the screen. */
const LOUPE_SIZE = 104;

const STYLES = `
  #${OVERLAY_ID} {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    color: #fbfbfe;
  }
  #${OVERLAY_ID} canvas.lw-cp-shot {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  #${OVERLAY_ID} .lw-cp-hint {
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    background: #1c1b22;
    border: 1px solid #4a4a52;
    border-radius: 20px;
    padding: 9px 18px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    white-space: nowrap;
  }
  #${OVERLAY_ID} canvas.lw-cp-loupe {
    position: absolute;
    width: ${LOUPE_SIZE}px;
    height: ${LOUPE_SIZE}px;
    border: 1px solid #4a4a52;
    border-radius: 6px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
    image-rendering: pixelated;
    pointer-events: none;
  }
  #${OVERLAY_ID} .lw-cp-readout {
    position: absolute;
    padding: 4px 8px;
    background: #1c1b22;
    border: 1px solid #4a4a52;
    border-radius: 5px;
    font-family: ui-monospace, monospace;
    white-space: nowrap;
    pointer-events: none;
  }
  #${OVERLAY_ID} .lw-cp-box {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: #1c1b22;
    color: #fbfbfe;
    border: 1px solid #4a4a52;
    border-radius: 8px;
    padding: 16px;
    min-width: 280px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    cursor: default;
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
`;

/** The elements of the picker that are alive right now. */
let picker = null;

function ensureStyles() {
  if (document.getElementById("librewolf-colorpicker-styles")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "librewolf-colorpicker-styles";
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}

function removeOverlay() {
  if (picker?.onKey) {
    document.removeEventListener("keydown", picker.onKey, true);
  }
  picker = null;
  document.getElementById(OVERLAY_ID)?.remove();
}

/** Converts the color of a pixel into the three formats. */
function formatsOf(r, g, b) {
  const hex = `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;

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
    hex: hex.toUpperCase(),
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
  };
}

/** The color of the pixel of the picture under the pointer of the mouse. */
function pixelUnder(event) {
  const rect = picker.shot.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (picker.shot.width / rect.width));
  const y = Math.floor((event.clientY - rect.top) * (picker.shot.height / rect.height));

  if (x < 0 || y < 0 || x >= picker.shot.width || y >= picker.shot.height) {
    return null;
  }

  const data = picker.ctx.getImageData(x, y, 1, 1).data;
  return { x, y, r: data[0], g: data[1], b: data[2] };
}

/** Shows the pixels around the pointer of the mouse in the loupe. */
function drawLoupe(pixel) {
  const { loupe, loupeCtx } = picker;
  const half = Math.max(1, Math.round(LOUPE_SIZE / 2 / ZOOM));

  loupeCtx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
  loupeCtx.imageSmoothingEnabled = false;
  loupeCtx.drawImage(
    picker.shot,
    pixel.x - half,
    pixel.y - half,
    half * 2,
    half * 2,
    0,
    0,
    LOUPE_SIZE,
    LOUPE_SIZE,
  );

  // The square in the middle of the loupe is the pixel under the mouse.
  loupeCtx.strokeStyle = "#ffffff";
  loupeCtx.lineWidth = 1;
  loupeCtx.strokeRect(
    LOUPE_SIZE / 2 - ZOOM / 2 - 0.5,
    LOUPE_SIZE / 2 - ZOOM / 2 - 0.5,
    ZOOM + 1,
    ZOOM + 1,
  );
  loupeCtx.strokeStyle = "#000000";
  loupeCtx.strokeRect(
    LOUPE_SIZE / 2 - ZOOM / 2 - 1.5,
    LOUPE_SIZE / 2 - ZOOM / 2 - 1.5,
    ZOOM + 3,
    ZOOM + 3,
  );
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

/** Shows the color that was picked, with the three formats of it. */
function showResult(pixel, format) {
  const values = formatsOf(pixel.r, pixel.g, pixel.b);

  const box = document.createElement("div");
  box.className = "lw-cp-box";
  box.innerHTML = `
    <div class="lw-cp-swatch" style="background:${values.hex}"></div>
    <div class="lw-cp-values">
      <div><span>HEX</span><strong class="lw-cp-hex">${values.hex}</strong></div>
      <div><span>RGB</span><strong class="lw-cp-rgb">${values.rgb}</strong></div>
      <div><span>HSL</span><strong class="lw-cp-hsl">${values.hsl}</strong></div>
    </div>
    <div class="lw-cp-actions">
      <button data-format="hex">Copy HEX</button>
      <button data-format="rgb">Copy RGB</button>
      <button data-format="hsl">Copy HSL</button>
    </div>
    <div class="lw-cp-actions">
      <button class="lw-cp-done">Close</button>
    </div>
  `;

  box.querySelectorAll("button[data-format]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(values[button.dataset.format]);
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = `Copy ${button.dataset.format.toUpperCase()}`;
      }, 1200);
    });
  });

  box.querySelector(".lw-cp-done").addEventListener("click", () => {
    removeOverlay();
  });

  picker.loupe.remove();
  picker.readout.remove();
  picker.hint.remove();
  picker.overlay.appendChild(box);

  // The color of the pixel is copied right away, in the format of the last
  // time, the buttons of the panel copy it in the other formats.
  browser.storage.local.set({ [FORMAT_KEY]: format }).catch(() => {});
  copyText(values[format] || values.hex).catch(() => {});
}

/** Starts the pick with the picture of the visible part of the tab. */
async function startPick(dataUrl, format) {
  removeOverlay();
  ensureStyles();

  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch (error) {
    console.error("The picture of the page could not be read", error);
    return;
  }

  const shot = document.createElement("canvas");
  shot.className = "lw-cp-shot";
  shot.width = image.naturalWidth || image.width;
  shot.height = image.naturalHeight || image.height;

  const ctx = shot.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.appendChild(shot);

  const hint = document.createElement("div");
  hint.className = "lw-cp-hint";
  hint.textContent = "Click on a color to pick it, Esc to cancel.";
  overlay.appendChild(hint);

  const loupe = document.createElement("canvas");
  loupe.className = "lw-cp-loupe";
  loupe.width = LOUPE_SIZE;
  loupe.height = LOUPE_SIZE;
  overlay.appendChild(loupe);

  const readout = document.createElement("div");
  readout.className = "lw-cp-readout";
  readout.textContent = "";
  overlay.appendChild(readout);

  document.documentElement.appendChild(overlay);

  picker = {
    overlay,
    shot,
    ctx,
    loupe,
    loupeCtx: loupe.getContext("2d"),
    readout,
    hint,
    format: format || "hex",
  };

  overlay.addEventListener("mousemove", (event) => {
    const pixel = pixelUnder(event);
    if (!pixel) {
      return;
    }

    drawLoupe(pixel);

    const values = formatsOf(pixel.r, pixel.g, pixel.b);
    readout.textContent = values.hex;
    readout.style.left = `${event.clientX + 18}px`;
    readout.style.top = `${event.clientY + 18}px`;

    // The loupe goes to the other side of the mouse near the edge of the
    // screen, so that it is always fully visible.
    const flipX = event.clientX + LOUPE_SIZE + 30 > window.innerWidth;
    const flipY = event.clientY + LOUPE_SIZE + 30 > window.innerHeight;
    loupe.style.left = `${flipX ? event.clientX - LOUPE_SIZE - 18 : event.clientX + 18}px`;
    loupe.style.top = `${flipY ? event.clientY - LOUPE_SIZE - 18 : event.clientY + 18}px`;
  });

  overlay.addEventListener("mouseleave", () => {
    loupe.style.display = "none";
    readout.style.display = "none";
  });

  overlay.addEventListener("mouseenter", () => {
    loupe.style.display = "block";
    readout.style.display = "block";
  });

  overlay.addEventListener("click", (event) => {
    // The page must not react to the click that picks the color.
    event.preventDefault();
    event.stopPropagation();

    const pixel = pixelUnder(event);
    if (!pixel) {
      return;
    }

    showResult(pixel, picker.format);
  });

  overlay.addEventListener("mousedown", (event) => event.preventDefault());
  overlay.addEventListener("contextmenu", (event) => event.preventDefault());
  overlay.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      removeOverlay();
    }
  };
  document.addEventListener("keydown", onKey, true);
  picker.onKey = onKey;
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "librewolf-colorpicker-image") {
    return undefined;
  }
  startPick(message.dataUrl, message.format || "hex");
  return Promise.resolve({ started: true });
});
