// The page side of the translation of the videos of YouTube. A small panel is
// put on the page, it starts the translation and plays the translated sound
// together with the video of the page.

const PANEL_ID = "librewolf-vot-panel";
const HIDDEN_KEY = "librewolf-vot-hidden";

const LANGUAGES = [
  ["auto", "The language of the video"],
  ["en", "English"],
  ["ru", "Russian"],
  ["es", "Spanish"],
  ["de", "German"],
  ["fr", "French"],
  ["it", "Italian"],
  ["pl", "Polish"],
  ["uk", "Ukrainian"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["tr", "Turkish"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
];

const STYLES = `
  #${PANEL_ID} {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483647;
    width: 290px;
    padding: 12px;
    border-radius: 10px;
    background: #1c1b22;
    color: #fbfbfe;
    border: 1px solid #4a4a52;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
    font: 13px system-ui, sans-serif;
  }
  #${PANEL_ID} h2 {
    margin: 0 0 8px;
    font-size: 14px;
  }
  #${PANEL_ID} .lw-vot-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 8px;
  }
  #${PANEL_ID} select {
    flex: 1;
    min-width: 0;
    background: #0f0f14;
    color: #fbfbfe;
    border: 1px solid #4a4a52;
    border-radius: 5px;
    padding: 4px 6px;
    font: inherit;
  }
  #${PANEL_ID} button {
    padding: 6px 10px;
    border-radius: 5px;
    border: 1px solid #4a4a52;
    background: #2b2a33;
    color: #fbfbfe;
    cursor: pointer;
    font: inherit;
  }
  #${PANEL_ID} button:hover { background: #3a3944; }
  #${PANEL_ID} button.primary {
    background: #0060df;
    border-color: #0060df;
  }
  #${PANEL_ID} button.stop {
    background: #d70022;
    border-color: #d70022;
  }
  #${PANEL_ID} .lw-vot-status {
    margin: 8px 0 0;
    color: #b1b1bd;
    font-size: 12px;
    line-height: 1.5;
    word-break: break-word;
  }
  #${PANEL_ID} .lw-vot-status.error { color: #ff8a80; }
  #${PANEL_ID} .lw-vot-status.ready { color: #7ee787; }
  #${PANEL_ID} .lw-vot-close {
    position: absolute;
    top: 6px;
    right: 8px;
    padding: 0 6px;
    background: transparent;
    border: none;
    color: #b1b1bd;
    font-size: 16px;
  }
  #${PANEL_ID} .lw-vot-hide {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483647;
    padding: 8px 14px;
    border-radius: 20px;
    background: #1c1b22;
    color: #fbfbfe;
    border: 1px solid #4a4a52;
    font: 13px system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  }
`;

/** The sound of the translation, it is played together with the video. */
let audio = null;
/** The video of the page, it is the one of the player. */
let video = null;
/** The state of the translation. */
let state = "idle";

function ensureStyles() {
  if (document.getElementById("librewolf-vot-styles")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "librewolf-vot-styles";
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}

/** The id of the video of the page. */
function videoId() {
  const url = new URL(location.href);
  if (url.hostname.endsWith("youtu.be")) {
    return url.pathname.slice(1).split("/")[0] || null;
  }
  if (url.pathname === "/watch") {
    return url.searchParams.get("v") || null;
  }
  const match = /\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(url.pathname);
  return match ? match[1] : null;
}

/** The title of the video. */
function videoTitle() {
  const title =
    document.querySelector('meta[name="title"]')?.content ||
    document.querySelector("h1.title")?.textContent ||
    document.title;
  return (title || "").replace(/\s*-\s*YouTube$/, "").trim();
}

/** The video element of the player. */
function findVideo() {
  if (video && video.isConnected) {
    return video;
  }
  const found = document.querySelector("video");
  video = found || null;
  return video;
}

/** The language of the page, it is the language of the video. */
function pageLanguage() {
  const lang = document.documentElement.lang || "en";
  return lang.split("-")[0].toLowerCase();
}

function status(text, kind = "") {
  const node = document.querySelector(`#${PANEL_ID} .lw-vot-status`);
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = `lw-vot-status ${kind}`.trim();
}

/** Builds the panel of the translation. */
function buildPanel() {
  ensureStyles();

  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
  }

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <button class="lw-vot-close" title="Hide">×</button>
    <h2>Translation of the video</h2>
    <div class="lw-vot-row">
      <select id="lw-vot-source">
        ${LANGUAGES.map(
          ([code, name]) =>
            `<option value="${code}">${code === "auto" ? name : name}</option>`,
        ).join("")}
      </select>
      <select id="lw-vot-target">
        ${LANGUAGES.filter(([code]) => code !== "auto")
          .map(([code, name]) => `<option value="${code}">${name}</option>`)
          .join("")}
      </select>
    </div>
    <div class="lw-vot-row">
      <button id="lw-vot-start" class="primary">Translate</button>
      <button id="lw-vot-stop" class="stop" hidden>Stop</button>
    </div>
    <p class="lw-vot-status">The panel is ready.</p>
  `;
  document.documentElement.appendChild(panel);

  const source = panel.querySelector("#lw-vot-source");
  const target = panel.querySelector("#lw-vot-target");
  const start = panel.querySelector("#lw-vot-start");
  const stop = panel.querySelector("#lw-vot-stop");

  browser.storage.local.get("librewolf-vot-language").then((stored) => {
    const language = stored["librewolf-vot-language"] || { source: "auto", target: "ru" };
    source.value = language.source || "auto";
    target.value = language.target || "ru";
  });

  source.addEventListener("change", saveLanguage);
  target.addEventListener("change", saveLanguage);

  start.addEventListener("click", () => startTranslation());
  stop.addEventListener("click", () => stopTranslation());
  panel.querySelector(".lw-vot-close").addEventListener("click", hidePanel);

  start.hidden = false;
  stop.hidden = true;
}

function saveLanguage() {
  browser.storage.local.set({
    "librewolf-vot-language": {
      source: document.querySelector(`#${PANEL_ID} #lw-vot-source`).value,
      target: document.querySelector(`#${PANEL_ID} #lw-vot-target`).value,
    },
  });
}

function hidePanel() {
  document.getElementById(PANEL_ID)?.remove();
  browser.storage.local.set({ [HIDDEN_KEY]: true });
}

/**
 * The panel is put on the page of a video of YouTube by itself, unless the
 * user has closed it.
 */
async function openPanelIfNeeded() {
  if (!videoId()) {
    return;
  }
  const stored = await browser.storage.local.get(HIDDEN_KEY);
  if (stored[HIDDEN_KEY]) {
    return;
  }
  buildPanel();
}

/** Starts the translation of the video of the page. */
async function startTranslation() {
  const id = videoId();
  if (!id) {
    status("The page has no video of YouTube.", "error");
    return;
  }

  const source = document.querySelector(`#${PANEL_ID} #lw-vot-source`).value;
  const target = document.querySelector(`#${PANEL_ID} #lw-vot-target`).value;
  const player = findVideo();

  setButtons(true);
  status("The service is asked for the translation.");

  await browser.runtime.sendMessage({
    type: "librewolf-vot-translate",
    video: {
      videoId: id,
      url: `https://youtu.be/${id}`,
      title: videoTitle(),
      duration: player && Number.isFinite(player.duration) ? player.duration : 310,
      sourceLanguage: source === "auto" ? pageLanguage() : source,
      targetLanguage: target,
    },
  });
}

async function stopTranslation() {
  await browser.runtime.sendMessage({ type: "librewolf-vot-stop" });
  stopAudio();
  setButtons(false);
  status("The translation is stopped.");
}

function setButtons(working) {
  const start = document.querySelector(`#${PANEL_ID} #lw-vot-start`);
  const stop = document.querySelector(`#${PANEL_ID} #lw-vot-stop`);
  if (start) {
    start.hidden = working;
  }
  if (stop) {
    stop.hidden = !working;
  }
}

/** The sound of the translation is put on the page and is played with it. */
function playAudio(url) {
  stopAudio();

  const player = findVideo();
  if (!player) {
    status("The page has no player.", "error");
    return;
  }

  audio = new Audio();
  audio.src = url;
  audio.preload = "auto";

  audio.addEventListener("error", async () => {
    // The page cannot read the sound by itself, it is read by the extension.
    try {
      const answer = await browser.runtime.sendMessage({
        type: "librewolf-vot-fetch-audio",
        url,
      });
      const blob = new Blob([answer.buffer], { type: answer.type || "audio/mpeg" });
      audio.src = URL.createObjectURL(blob);
      audio.play().catch(() => {});
    } catch (error) {
      status(`The sound of the translation could not be played: ${error}`, "error");
    }
  });

  if (player.paused) {
    audio.currentTime = player.currentTime;
  }
  audio.play().catch(() => {
    // The browser waits for a click of the user, the sound starts with the video.
  });

  player.addEventListener("play", () => audio.play().catch(() => {}));
  player.addEventListener("pause", () => audio.pause());
  player.addEventListener("seeked", () => {
    audio.currentTime = player.currentTime;
  });

  // The sound must not run away from the video.
  const timer = setInterval(() => {
    if (!audio || !player.isConnected) {
      clearInterval(timer);
      return;
    }
    if (!player.paused && Math.abs(audio.currentTime - player.currentTime) > 0.4) {
      audio.currentTime = player.currentTime;
    }
  }, 1000);
}

function stopAudio() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio = null;
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "librewolf-vot-open") {
    await browser.storage.local.set({ [HIDDEN_KEY]: false });
    buildPanel();
    return Promise.resolve({ ok: true });
  }

  if (message?.type === "librewolf-vot-state") {
    const stored = await browser.storage.local.get(HIDDEN_KEY);
    if (!document.getElementById(PANEL_ID)) {
      if (stored[HIDDEN_KEY]) {
        return Promise.resolve({ ok: true });
      }
      buildPanel();
    }

    if (message.state === "working") {
      setButtons(true);
      status(message.message || "The service is working.");
    } else if (message.state === "waiting") {
      setButtons(true);
      const seconds = message.remainingTime;
      status(
        seconds
          ? `${message.message}, about ${seconds} s left.`
          : message.message || "The service is working.",
      );
    } else if (message.state === "ready") {
      setButtons(false);
      status(message.message || "The translation is ready.", "ready");
      if (message.audioUrl) {
        playAudio(message.audioUrl);
      }
    } else if (message.state === "error") {
      setButtons(false);
      status(message.message || "The translation failed.", "error");
    } else if (message.state === "stopped") {
      setButtons(false);
      status(message.message || "The translation is stopped.");
    }

    return Promise.resolve({ ok: true });
  }

  return undefined;
});

// The panel is put on the page when the video of the page changes.
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    stopAudio();
    setButtons(false);
    status("The panel is ready.");
    openPanelIfNeeded();
  }
}, 1000);

openPanelIfNeeded();
