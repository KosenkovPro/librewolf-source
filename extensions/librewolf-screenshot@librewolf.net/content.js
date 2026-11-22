// The page side of the screenshot tool. The picture of the page is shown in an
// overlay, the user cuts a part of it out, draws on it and saves it.

const OVERLAY_ID = "librewolf-screenshot-overlay";

const TOOLS = {
  select: { label: "Select", cursor: "crosshair" },
  arrow: { label: "Arrow", cursor: "crosshair" },
  rectangle: { label: "Frame", cursor: "crosshair" },
  marker: { label: "Marker", cursor: "crosshair" },
  blur: { label: "Blur", cursor: "crosshair" },
  text: { label: "Text", cursor: "text" },
};

const STYLES = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(0, 0, 0, 0.6);
  font-family: system-ui, sans-serif;
  color: #fbfbfe;
}
#${OVERLAY_ID} .lw-sc-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
#${OVERLAY_ID} .lw-sc-wrap {
  position: relative;
  max-width: 96vw;
  max-height: 92vh;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  background: #fff;
}
#${OVERLAY_ID} canvas {
  display: block;
  max-width: 96vw;
  max-height: 92vh;
}
#${OVERLAY_ID} .lw-sc-toolbar {
  position: absolute;
  left: 50%;
  top: 14px;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  background: #1c1b22;
  border: 1px solid #4a4a52;
  border-radius: 8px;
  padding: 8px;
  max-width: 96vw;
}
#${OVERLAY_ID} button {
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid #4a4a52;
  background: #2b2a33;
  color: #fbfbfe;
  cursor: pointer;
  font-size: 12px;
}
#${OVERLAY_ID} button:hover { background: #3a3944; }
#${OVERLAY_ID} button.active { background: #0060df; border-color: #0060df; }
#${OVERLAY_ID} button.primary { background: #2ac769; border-color: #2ac769; color: #06210f; }
#${OVERLAY_ID} .lw-sc-selection {
  position: absolute;
  border: 2px dashed #0060df;
  background: rgba(0, 96, 223, 0.12);
  pointer-events: none;
}
#${OVERLAY_ID} .lw-sc-hint {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  background: #1c1b22;
  border: 1px solid #4a4a52;
  border-radius: 18px;
  padding: 8px 16px;
  font-size: 13px;
}
#${OVERLAY_ID} .lw-sc-text-input {
  position: absolute;
  z-index: 10;
  padding: 4px 6px;
  font: 14px system-ui, sans-serif;
  border-radius: 4px;
  border: 1px solid #0060df;
  background: #fff;
  color: #000;
  min-width: 160px;
}
`;

const state = {
  image: null,
  canvas: null,
  context: null,
  annotation: null,
  tool: "select",
  selection: null,
  dragging: null,
  drawing: null,
};

function ensureStyles() {
  if (document.getElementById("librewolf-screenshot-styles")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "librewolf-screenshot-styles";
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}

function closeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  state.image = null;
  state.canvas = null;
  state.selection = null;
}

function toolButton(tool, label) {
  const button = document.createElement("button");
  button.textContent = label;
  button.dataset.tool = tool;
  button.classList.toggle("active", state.tool === tool);
  return button;
}

/** The picture that is saved: the cut out part with the drawings on it. */
function compose() {
  const { selection } = state;
  if (!selection) {
    return null;
  }

  const result = document.createElement("canvas");
  result.width = selection.width;
  result.height = selection.height;
  const context = result.getContext("2d");
  context.drawImage(
    state.image,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height,
  );
  context.drawImage(
    state.annotation,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height,
  );
  return result.toDataURL("image/png");
}

async function exportImage(kind) {
  const dataUrl = compose();
  if (!dataUrl) {
    return;
  }

  if (kind === "copy") {
    await browser.runtime.sendMessage({ type: "librewolf-screenshot-copy", dataUrl });
    return;
  }

  if (kind === "png") {
    await browser.runtime.sendMessage({
      type: "librewolf-screenshot-save",
      dataUrl,
      name: "librewolf-screenshot.png",
    });
    return;
  }

  if (kind === "pdf") {
    await browser.runtime.sendMessage({
      type: "librewolf-screenshot-pdf",
      dataUrl,
      name: "librewolf-screenshot.pdf",
    });
  }
}

function updateToolbar() {
  for (const button of document.querySelectorAll(`#${OVERLAY_ID} button[data-tool]`)) {
    button.classList.toggle("active", button.dataset.tool === state.tool);
  }
}

function showTools() {
  const overlay = document.getElementById(OVERLAY_ID);
  const toolbar = overlay.querySelector(".lw-sc-toolbar");
  toolbar.textContent = "";

  for (const [tool, info] of Object.entries(TOOLS)) {
    toolbar.appendChild(toolButton(tool, info.label));
  }

  const copy = document.createElement("button");
  copy.textContent = "Copy";
  copy.addEventListener("click", () => exportImage("copy"));

  const png = document.createElement("button");
  png.textContent = "Save PNG";
  png.addEventListener("click", () => exportImage("png"));

  const pdf = document.createElement("button");
  pdf.textContent = "Save PDF";
  pdf.addEventListener("click", () => exportImage("pdf"));

  const whole = document.createElement("button");
  whole.className = "primary";
  whole.textContent = "Whole page";
  whole.addEventListener("click", async () => {
    whole.disabled = true;
    whole.textContent = "Capturing…";
    const answer = await browser.runtime.sendMessage({ type: "librewolf-screenshot-full-page" });
    if (answer?.dataUrl) {
      showImage(answer.dataUrl, { whole: true });
    }
    whole.disabled = false;
    whole.textContent = "Whole page";
  });

  const html = document.createElement("button");
  html.textContent = "Save HTML";
  html.addEventListener("click", async () => {
    html.disabled = true;
    html.textContent = "Saving…";
    await browser.runtime.sendMessage({
      type: "librewolf-screenshot-html",
      name: "librewolf-page.html",
    });
    html.disabled = false;
    html.textContent = "Save HTML";
  });

  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", closeOverlay);

  toolbar.append(copy, png, pdf, whole, html, close);
  updateToolbar();
}

/** Shows a picture in the overlay, the whole page is not cut out. */
function showImage(dataUrl, options = {}) {
  const overlay = document.getElementById(OVERLAY_ID);
  const wrap = overlay.querySelector(".lw-sc-wrap");
  wrap.textContent = "";

  const canvas = document.createElement("canvas");
  wrap.appendChild(canvas);
  state.canvas = canvas;
  state.context = canvas.getContext("2d");
  state.selection = options.whole
    ? { x: 0, y: 0, width: 0, height: 0 }
    : null;

  const image = new Image();
  image.onload = () => {
    state.image = image;
    canvas.width = image.width;
    canvas.height = image.height;

    const annotation = document.createElement("canvas");
    annotation.width = image.width;
    annotation.height = image.height;
    state.annotation = annotation;

    if (options.whole) {
      state.selection = { x: 0, y: 0, width: image.width, height: image.height };
    }

    draw();
    showTools();
    overlay.querySelector(".lw-sc-hint").textContent = options.whole
      ? "Draw on the picture and save it."
      : "Drag a rectangle over the part of the page you want to keep.";
  };
  image.src = dataUrl;
}

/** Draws the picture of the page and the annotations on the canvas. */
function draw() {
  if (!state.context || !state.image) {
    return;
  }
  state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  state.context.drawImage(state.image, 0, 0);
  state.context.drawImage(state.annotation, 0, 0);
}

/** The position of the mouse in the coordinates of the picture. */
function picturePosition(event) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function drawArrow(context, from, to, color, width) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.max(12, width * 4);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.stroke();

  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(
    to.x - head * Math.cos(angle - Math.PI / 7),
    to.y - head * Math.sin(angle - Math.PI / 7),
  );
  context.lineTo(
    to.x - head * Math.cos(angle + Math.PI / 7),
    to.y - head * Math.sin(angle + Math.PI / 7),
  );
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

/** Blurs the part of the picture under the rectangle. */
function drawBlur(context, from, to) {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  if (!width || !height) {
    return;
  }

  const patch = document.createElement("canvas");
  patch.width = width;
  patch.height = height;
  const patchContext = patch.getContext("2d");
  patchContext.filter = "blur(8px)";
  patchContext.drawImage(state.image, x, y, width, height, 0, 0, width, height);
  context.drawImage(patch, x, y);
}

function onMouseDown(event) {
  if (!state.canvas) {
    return;
  }
  const point = picturePosition(event);
  state.drawing = { from: point, to: point };
  state.canvas.setPointerCapture?.(event.pointerId);
}

function onMouseMove(event) {
  if (!state.drawing) {
    return;
  }
  state.drawing.to = picturePosition(event);

  const context = state.annotation.getContext("2d");
  if (state.tool === "select") {
    const { from, to } = state.drawing;
    const selection = document.querySelector(`#${OVERLAY_ID} .lw-sc-selection`);
    if (selection) {
      const rect = state.canvas.getBoundingClientRect();
      const scaleX = rect.width / state.canvas.width;
      const scaleY = rect.height / state.canvas.height;
      selection.style.left = `${rect.left + Math.min(from.x, to.x) * scaleX}px`;
      selection.style.top = `${rect.top + Math.min(from.y, to.y) * scaleY}px`;
      selection.style.width = `${Math.abs(to.x - from.x) * scaleX}px`;
      selection.style.height = `${Math.abs(to.y - from.y) * scaleY}px`;
    }
    return;
  }

  if (state.tool === "blur") {
    drawBlur(context, state.drawing.from, state.drawing.to);
    draw();
    return;
  }

  if (state.tool === "marker") {
    context.beginPath();
    context.moveTo(state.drawing.from.x, state.drawing.from.y);
    context.lineTo(state.drawing.to.x, state.drawing.to.y);
    context.strokeStyle = "#ff3b30";
    context.lineWidth = 6;
    context.lineCap = "round";
    context.stroke();
    draw();
    return;
  }

  if (state.tool === "arrow") {
    drawArrow(context, state.drawing.from, state.drawing.to, "#ff3b30", 6);
    draw();
    return;
  }

  if (state.tool === "rectangle") {
    context.clearRect(0, 0, state.annotation.width, state.annotation.height);
    context.strokeStyle = "#ff3b30";
    context.lineWidth = 5;
    context.strokeRect(
      state.drawing.from.x,
      state.drawing.from.y,
      state.drawing.to.x - state.drawing.from.x,
      state.drawing.to.y - state.drawing.from.y,
    );
    draw();
  }
}

function onMouseUp(event) {
  if (!state.drawing) {
    return;
  }
  const { from, to } = state.drawing;
  state.drawing = null;

  if (state.tool === "select") {
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const width = Math.abs(to.x - from.x);
    const height = Math.abs(to.y - from.y);
    if (width < 4 || height < 4) {
      return;
    }
    state.selection = { x, y, width, height };
    document.querySelector(`#${OVERLAY_ID} .lw-sc-selection`)?.remove();
    document
      .querySelector(`#${OVERLAY_ID} .lw-sc-hint`)
      ?.replaceChildren("Pick a tool and draw on the selection.");
    return;
  }

  if (state.tool === "rectangle") {
    // The rectangle was drawn while the mouse was moving, it is kept.
    return;
  }

  if (state.tool === "text") {
    const input = document.createElement("input");
    input.className = "lw-sc-text-input";
    input.type = "text";
    input.placeholder = "The text of the note";
    input.style.left = `${event.clientX}px`;
    input.style.top = `${event.clientY}px`;
    document.body.appendChild(input);
    input.focus();

    const finish = () => {
      const context = state.annotation.getContext("2d");
      context.font = "600 28px system-ui, sans-serif";
      context.fillStyle = "#ff3b30";
      context.strokeStyle = "#ffffff";
      context.lineWidth = 4;
      context.strokeText(input.value, from.x, from.y);
      context.fillText(input.value, from.x, from.y);
      input.remove();
      draw();
    };

    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") {
        finish();
      } else if (keyEvent.key === "Escape") {
        input.remove();
      }
    });
    input.addEventListener("blur", finish);
  }
}

/** Shows the overlay with the picture of the page. */
function show(dataUrl) {
  ensureStyles();
  closeOverlay();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="lw-sc-stage">
      <div class="lw-sc-wrap"></div>
    </div>
    <div class="lw-sc-toolbar"></div>
    <div class="lw-sc-hint">Drag a rectangle over the part of the page you want to keep.</div>
  `;
  document.documentElement.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tool]");
    if (button) {
      state.tool = button.dataset.tool;
      updateToolbar();
    }
  });

  state.canvas = null;
  const canvas = document.createElement("canvas");
  overlay.querySelector(".lw-sc-wrap").appendChild(canvas);
  state.canvas = canvas;

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOverlay();
    }
  });

  showImage(dataUrl);
}

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "librewolf-screenshot-show") {
    show(message.dataUrl);
    return Promise.resolve({ ok: true });
  }

  if (message?.type === "librewolf-screenshot-page") {
    const stylesheets = [];
    for (const sheet of document.styleSheets) {
      if (sheet.href) {
        stylesheets.push(sheet.href);
      }
    }
    const images = [];
    for (const image of document.images) {
      if (image.currentSrc || image.src) {
        images.push({ src: image.currentSrc || image.src, selector: image.currentSrc || image.src });
      }
    }
    return Promise.resolve({
      html: document.documentElement.outerHTML,
      title: document.title,
      base: document.baseURI,
      stylesheets,
      images,
    });
  }

  return undefined;
});
