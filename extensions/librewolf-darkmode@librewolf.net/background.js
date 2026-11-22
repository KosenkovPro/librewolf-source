// The dark mode of the fork. The settings are kept per domain, the mode of a
// domain is stored in the local storage and the content script applies it.

const SETTINGS_KEY = "librewolf-darkmode-settings";
const STYLE_ID = "librewolf-darkmode-style";

const DEFAULT_SETTINGS = {
  // "auto" follows the state of the system, "on" and "off" are the choice of
  // the user for the whole browser.
  global: "auto",
  brightness: 1,
  contrast: 1,
  // The domains where the mode is turned off, the key is the domain.
  domains: {},
};

/** The domain of a url, without the leading www. */
function domainOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || null;
  } catch (error) {
    return null;
  }
}

async function getSettings() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/**
 * The state of the dark mode for a domain: true, false or null when the
 * choice of the user does not say anything about it.
 */
function stateFor(settings, domain) {
  if (domain && Object.prototype.hasOwnProperty.call(settings.domains, domain)) {
    return settings.domains[domain];
  }
  if (settings.global === "on") {
    return true;
  }
  if (settings.global === "off") {
    return false;
  }
  return null;
}

/** The dark mode follows the system when the user did not choose anything. */
function prefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

async function badgeFor(tab) {
  const settings = await getSettings();
  const domain = domainOf(tab?.url || "");
  const state = stateFor(settings, domain);
  let text = "";

  if (state === true) {
    text = "ON";
  } else if (state === false) {
    text = "OFF";
  } else if (settings.global === "auto") {
    text = prefersDark() ? "ON" : "OFF";
  }

  await browser.browserAction.setBadgeText({ text, tabId: tab.id });
  await browser.browserAction.setBadgeBackgroundColor({
    color: state === true ? "#2ac769" : "#4a4a52",
    tabId: tab.id,
  });
}

async function refreshTab(tab) {
  if (!tab?.id) {
    return;
  }
  const settings = await getSettings();
  const domain = domainOf(tab.url || "");
  const state = stateFor(settings, domain);
  const enabled = state === null ? prefersDark() : state;

  try {
    await browser.tabs.sendMessage(tab.id, {
      type: "librewolf-darkmode-apply",
      enabled,
      brightness: settings.brightness,
      contrast: settings.contrast,
    });
  } catch (error) {
    // The content script is not in this page, nothing to do.
  }
}

/**
 * The tab in the front of the window.
 *
 * The panel of the extension has no page of its own, the message of it does
 * not carry a tab.
 */
async function activeTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message?.type === "librewolf-darkmode-get-state") {
    const settings = await getSettings();
    const tab = sender.tab || (await activeTab());
    const domain = domainOf(tab?.url || "");
    const state = stateFor(settings, domain);
    return {
      settings,
      domain,
      enabled: state === null ? prefersDark() : state,
    };
  }

  if (message?.type === "librewolf-darkmode-set") {
    const settings = await getSettings();
    const { domain, mode, brightness, contrast } = message;

    if (mode !== undefined) {
      if (mode === "inherit") {
        delete settings.domains[domain];
      } else {
        settings.domains[domain] = mode === "on";
      }
    }
    if (brightness !== undefined) {
      settings.brightness = brightness;
    }
    if (contrast !== undefined) {
      settings.contrast = contrast;
    }
    if (message.global !== undefined) {
      settings.global = message.global;
    }

    await saveSettings(settings);

    // The page that is in the front is the one that has to be changed.
    const tab = sender.tab || (await activeTab());
    await refreshTab(tab);
    if (tab?.id) {
      await badgeFor(tab);
    }

    return { ok: true, settings };
  }

  return undefined;
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  await badgeFor(tab);
  await refreshTab(tab);
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    await badgeFor(tab);
    await refreshTab(tab);
  }
});

browser.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await saveSettings(settings);
});

// The system theme can change while the browser is open.
if (typeof window !== "undefined" && window.matchMedia) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", async () => {
    const settings = await getSettings();
    if (settings.global !== "auto") {
      return;
    }
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      await badgeFor(tab);
      await refreshTab(tab);
    }
  });
}

browser.runtime.onStartup.addListener(async () => {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    await badgeFor(tab);
    await refreshTab(tab);
  }
});
