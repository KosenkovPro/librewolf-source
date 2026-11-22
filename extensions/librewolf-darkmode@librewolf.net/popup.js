// The panel of the dark mode: the state of the current website, the settings
// of the colors and the list of the exceptions.

const domainLabel = document.getElementById("domain");
const modeButtons = document.getElementById("modes");
const globalButtons = document.getElementById("global");
const brightness = document.getElementById("brightness");
const contrast = document.getElementById("contrast");
const brightnessValue = document.getElementById("brightness-value");
const contrastValue = document.getElementById("contrast-value");
const exceptions = document.getElementById("exceptions");

let state = null;

async function load() {
  state = await browser.runtime.sendMessage({ type: "librewolf-darkmode-get-state" });

  domainLabel.textContent = state.domain || "This page has no domain";

  brightness.value = String(state.settings.brightness);
  contrast.value = String(state.settings.contrast);
  brightnessValue.textContent = Number(state.settings.brightness).toFixed(2);
  contrastValue.textContent = Number(state.settings.contrast).toFixed(2);

  const current =
    state.settings.domains && Object.prototype.hasOwnProperty.call(state.settings.domains, state.domain)
      ? state.settings.domains[state.domain]
      : null;

  for (const button of modeButtons.querySelectorAll("button")) {
    const mode = button.dataset.mode;
    const active = mode === "inherit" ? current === null : current === (mode === "on");
    button.classList.toggle("active", active);
  }

  for (const button of globalButtons.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.global === state.settings.global);
  }

  renderExceptions();
}

function renderExceptions() {
  exceptions.textContent = "";
  const domains = Object.keys(state.settings.domains || {}).sort();

  if (!domains.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "There are no exceptions yet.";
    exceptions.appendChild(empty);
    return;
  }

  for (const domain of domains) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${domain} (${state.settings.domains[domain] ? "on" : "off"})`;
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      await browser.runtime.sendMessage({
        type: "librewolf-darkmode-set",
        domain,
        mode: "inherit",
      });
      await load();
    });
    item.append(name, remove);
    exceptions.appendChild(item);
  }
}

async function setMode(mode) {
  await browser.runtime.sendMessage({
    type: "librewolf-darkmode-set",
    domain: state.domain,
    mode,
  });
  await load();
}

modeButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) {
    setMode(button.dataset.mode);
  }
});

globalButtons.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }
  await browser.runtime.sendMessage({
    type: "librewolf-darkmode-set",
    domain: state.domain,
    global: button.dataset.global,
  });
  await load();
});

brightness.addEventListener("change", async () => {
  await browser.runtime.sendMessage({
    type: "librewolf-darkmode-set",
    domain: state.domain,
    brightness: Number(brightness.value),
  });
  brightnessValue.textContent = Number(brightness.value).toFixed(2);
});

contrast.addEventListener("change", async () => {
  await browser.runtime.sendMessage({
    type: "librewolf-darkmode-set",
    domain: state.domain,
    contrast: Number(contrast.value),
  });
  contrastValue.textContent = Number(contrast.value).toFixed(2);
});

load();
