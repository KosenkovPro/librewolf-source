// The bridge between the browser and the local MCP server. The server listens
// on the loopback interface, the events of the server arrive as a stream and
// the tools of the browser are called with the same connection.

const SETTINGS_KEY = "librewolf-mcp-settings";
const CONSOLE_KEY = "librewolf-mcp-console";

const DEFAULT_SETTINGS = {
  // The address of the MCP server of the fork.
  server: "http://127.0.0.1:8977",
  // The address of the speech to text service, whisper.cpp by default.
  stt: "http://127.0.0.1:8080/inference",
};

let source = null;
let connected = false;
const consoleLog = [];
const networkLog = [];

async function getSettings() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

function broadcast(message) {
  browser.runtime.sendMessage({ type: "librewolf-mcp-event", ...message }).catch(() => {
    // The panel is closed, nobody listens to the events.
  });
}

function log(level, text) {
  const entry = { time: Date.now(), level, text: String(text) };
  consoleLog.push(entry);
  if (consoleLog.length > 500) {
    consoleLog.shift();
  }
  broadcast({ event: "log", entry });
}

/** The tools the agents of the command line can use. */
const TOOLS = {
  async tabs_list() {
    const tabs = await browser.tabs.query({});
    return tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
    }));
  },

  async tabs_create({ url }) {
    const tab = await browser.tabs.create({ url: url || "about:blank" });
    return { id: tab.id, url: tab.url };
  },

  async tabs_close({ tabId }) {
    await browser.tabs.remove(tabId);
    return { closed: tabId };
  },

  async tabs_activate({ tabId }) {
    const tab = await browser.tabs.get(tabId);
    await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
    return { activated: tabId };
  },

  async navigate({ tabId, url }) {
    await browser.tabs.update(tabId, { url });
    return { tabId, url };
  },

  async evaluate({ tabId, expression }) {
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: (code) => {
        try {
          // eslint-disable-next-line no-eval
          return { ok: true, value: eval(code) };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
      args: [expression],
    });
    return result[0]?.result ?? null;
  },

  async click({ tabId, selector }) {
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const element = document.querySelector(sel);
        if (!element) {
          return { ok: false, error: "The element was not found" };
        }
        element.scrollIntoView({ block: "center" });
        element.click();
        return { ok: true };
      },
      args: [selector],
    });
    return result[0]?.result ?? null;
  },

  async screenshot({ tabId }) {
    const tab = await browser.tabs.get(tabId);
    // The api of the browser has no number of a window, it takes the tab that
    // is in front of the window that is in front. The tab is put in front
    // first, so that the picture is of it.
    try {
      await browser.windows.update(tab.windowId, { focused: true });
      await browser.tabs.update(tabId, { active: true });
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      // The window cannot be put in front, the picture is of the tab that is
      // in front.
    }
    const dataUrl = await browser.tabs.captureVisibleTab({
      format: "png",
    });
    return { dataUrl };
  },

  async console_logs({ tabId }) {
    // The messages of the console are kept while an agent is connected.
    await installConsoleHook(tabId);
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: () => window.__librewolfConsole || [],
    });
    return result[0]?.result ?? [];
  },

  async network_requests() {
    return networkLog.slice(-200);
  },
};

/** Runs a tool of the browser for the server. */
async function runTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  log("info", `the agent calls ${name}`);
  return tool(args || {});
}

/**
 * Puts the keeper of the messages of the console into the page.
 *
 * It is only done while an agent is connected to the browser, the pages of
 * the browser stay fast without it.
 */
async function installConsoleHook(tabId) {
  if (!tabId) {
    return;
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["console.js"],
    });
  } catch (error) {
    // The page does not take scripts, there is nothing to keep there.
  }
}

/** Puts the keeper of the messages of the console into every page. */
async function installConsoleHookEverywhere() {
  if (!connected) {
    return;
  }
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      await installConsoleHook(tab.id);
    }
  }
}

async function connect() {
  const settings = await getSettings();
  disconnect();

  try {
    source = new EventSource(`${settings.server}/events`);
  } catch (error) {
    log("error", `The server of the agents was not found: ${error}`);
    broadcast({ event: "status", connected: false });
    return;
  }

  source.onopen = () => {
    connected = true;
    log("info", "the server of the agents is connected");
    broadcast({ event: "status", connected: true });
    installConsoleHookEverywhere();
  };

  source.onerror = () => {
    if (connected) {
      log("error", "the connection to the server of the agents was lost");
    }
    connected = false;
    broadcast({ event: "status", connected: false });
  };

  source.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.type === "tool-call") {
      try {
        const result = await runTool(message.tool, message.args);
        await send({ type: "tool-result", id: message.id, result });
      } catch (error) {
        await send({ type: "tool-result", id: message.id, error: String(error) });
      }
      return;
    }

    if (message.type === "prompt") {
      broadcast({ event: "prompt", text: message.text });
      return;
    }

    broadcast({ event: "message", message });
  };
}

function disconnect() {
  if (source) {
    source.close();
    source = null;
  }
  connected = false;
}

/** Sends a message to the server of the agents. */
async function send(message) {
  const settings = await getSettings();
  try {
    await fetch(`${settings.server}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (error) {
    log("error", `the message could not be delivered: ${error}`);
  }
}

// The requests of the pages are kept, the agents can look at them.
browser.webRequest.onCompleted.addListener(
  (details) => {
    networkLog.push({
      time: Date.now(),
      url: details.url,
      method: details.method,
      status: details.statusCode,
      type: details.type,
    });
    if (networkLog.length > 500) {
      networkLog.shift();
    }
  },
  { urls: ["<all_urls>"] },
);

// The messages of the console of a page are kept while an agent is connected.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (connected && changeInfo.status === "complete") {
    await installConsoleHook(tabId);
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message?.type) {
    case "librewolf-mcp-get-state": {
      const settings = await getSettings();
      return { connected, settings, log: consoleLog.slice(-200), network: networkLog.slice(-100) };
    }

    case "librewolf-mcp-set-settings": {
      const settings = await getSettings();
      await saveSettings({ ...settings, ...message.settings });
      return { ok: true };
    }

    case "librewolf-mcp-connect":
      await connect();
      return { ok: true, connected };

    case "librewolf-mcp-disconnect":
      disconnect();
      broadcast({ event: "status", connected: false });
      return { ok: true };

    case "librewolf-mcp-prompt":
      await send({ type: "prompt", text: message.text });
      return { ok: true };

    case "librewolf-mcp-transcribe": {
      // The speech to text service answers with the text of the sound.
      const settings = await getSettings();
      const response = await fetch(settings.stt, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: message.audio,
      });
      if (!response.ok) {
        throw new Error(`The speech to text service answered ${response.status}`);
      }
      const text = await response.text();
      return { text: text.trim() };
    }

    default:
      return undefined;
  }
});

browser.runtime.onInstalled.addListener(async () => {
  await connect();
});

browser.runtime.onStartup.addListener(async () => {
  await connect();
});

// The button of the toolbar opens the console of the agents.
browser.browserAction.onClicked.addListener(async () => {
  try {
    await browser.sidebarAction.open();
  } catch (error) {
    console.debug("The console of the agents could not be opened", error);
  }
});
