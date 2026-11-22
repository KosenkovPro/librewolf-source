// The setup of the profile of the fork.
//
// The extension of Hoppscotch is installed by the policy of the browser, but
// it is turned off at the start, so that it does not eat the memory of the
// machine. The user turns it on with two clicks: the button of the extension
// in the panel of the browser and the button in the panel of the extension.
// The bookmark of Hoppscotch is put on the panel of the bookmarks as well.

const HOPPSCOTCH_ID = "postwoman-firefox@postwoman.io";
const HOPPSCOTCH_URL = "https://hoppscotch.io";

// The key of the choice of the user in the storage of the extension.
const CHOICE_KEY = "hoppscotch";

// The folder of the bookmarks of the panel, the address of it is the same in
// every version of the browser.
const TOOLBAR_GUID = "toolbar_____";

// How long the extension waits for the extension of Hoppscotch, the policy of
// the browser installs it from the network and it can take a while.
const WAIT_FOR_ADDON_MS = 120000;
const CHECK_EVERY_MS = 3000;

/**
 * The folder of the bookmarks of the panel.
 *
 * The folder has an address of its own, it is the same in every version of
 * the browser, but the tree of the bookmarks is looked through as well, so
 * that the folder is found even when the address is not the one.
 */
async function toolbarFolder() {
  const byGuid = await browser.bookmarks.getSubTree(TOOLBAR_GUID);
  if (byGuid?.id) {
    return byGuid;
  }

  const tree = await browser.bookmarks.getTree();
  const root = tree[0];
  const found = (root?.children || []).find(
    (node) => node.guid === TOOLBAR_GUID || node.title === "Bookmarks Toolbar",
  );
  if (!found) {
    throw new Error("The folder of the bookmarks is not there");
  }
  return found;
}

/** The bookmark of Hoppscotch is put on the panel of the bookmarks. */
async function addBookmark() {
  try {
    const toolbar = await toolbarFolder();
    const children = toolbar.children || [];
    const exists = children.some(
      (child) =>
        child.url === HOPPSCOTCH_URL ||
        child.url === `${HOPPSCOTCH_URL}/` ||
        child.title === "Hoppscotch",
    );
    if (exists) {
      return true;
    }
    await browser.bookmarks.create({
      parentId: toolbar.id,
      title: "Hoppscotch",
      url: HOPPSCOTCH_URL,
    });
    return true;
  } catch (error) {
    console.debug("The bookmark of Hoppscotch could not be added", error);
    return false;
  }
}

/**
 * Waits for the bookmark of Hoppscotch and puts it on the panel.
 *
 * The service of the bookmarks is not ready at the first start of the
 * browser, the wait is here because of that.
 */
function waitAndBookmark() {
  const started = Date.now();

  const tick = async () => {
    const done = await addBookmark();
    if (done) {
      return;
    }
    if (Date.now() - started < WAIT_FOR_ADDON_MS) {
      setTimeout(tick, CHECK_EVERY_MS);
    }
  };

  tick();
}

/**
 * Turns off the extension of Hoppscotch.
 *
 * The extension of the browser installs it from the network, the wait for it
 * is here because of that.
 */
async function disableHoppscotch() {
  try {
    const addon = await browser.management.get(HOPPSCOTCH_ID);
    if (!addon) {
      return false;
    }
    if (addon.enabled) {
      await browser.management.setEnabled(HOPPSCOTCH_ID, false);
      console.info("The extension of Hoppscotch is turned off.");
    }
    return true;
  } catch (error) {
    console.debug("The extension of Hoppscotch could not be turned off", error);
    return false;
  }
}

/**
 * The choice of the user: "on" or "off".
 *
 * The extension of Hoppscotch is off until the user turns it on. The choice is
 * remembered, so that the browser does not turn the extension off again at the
 * next start.
 */
async function userChoice() {
  try {
    const data = await browser.storage.local.get(CHOICE_KEY);
    return data?.[CHOICE_KEY] === "on" ? "on" : "off";
  } catch (error) {
    console.debug("The choice of the user could not be read", error);
    return "off";
  }
}

/** The state of the extension of Hoppscotch. */
async function hoppscotchState() {
  try {
    const addon = await browser.management.get(HOPPSCOTCH_ID);
    return {
      installed: !!addon,
      enabled: !!(addon && addon.enabled),
    };
  } catch (error) {
    console.debug("The state of Hoppscotch could not be read", error);
    return { installed: false, enabled: false };
  }
}

/**
 * Turns the extension of Hoppscotch on or off, as the user asks for it in the
 * panel of the extension.
 */
async function toggleHoppscotch() {
  const state = await hoppscotchState();
  if (!state.installed) {
    return state;
  }
  try {
    await browser.management.setEnabled(HOPPSCOTCH_ID, !state.enabled);
    await browser.storage.local.set({
      [CHOICE_KEY]: state.enabled ? "off" : "on",
    });
    console.info(
      `The extension of Hoppscotch is turned ${state.enabled ? "off" : "on"}.`,
    );
  } catch (error) {
    console.debug("The extension of Hoppscotch could not be turned", error);
  }
  return hoppscotchState();
}

/** Waits for the extension of Hoppscotch and turns it off. */
function waitAndDisable() {
  const started = Date.now();

  const tick = async () => {
    // The user has turned the extension on, the choice is kept.
    if ((await userChoice()) === "on") {
      return;
    }
    const done = await disableHoppscotch();
    if (done) {
      return;
    }
    if (Date.now() - started < WAIT_FOR_ADDON_MS) {
      setTimeout(tick, CHECK_EVERY_MS);
    }
  };

  tick();
}

/**
 * The panel of the extension asks for the state of the extension of
 * Hoppscotch and turns it on or off.
 */
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "state") {
    return hoppscotchState();
  }
  if (message?.type === "toggle") {
    return toggleHoppscotch();
  }
  return undefined;
});

/** The work begins only once, the events of the browser can come at the same time. */
let started = false;

function start() {
  if (started) {
    return;
  }
  started = true;
  waitAndBookmark();
  waitAndDisable();
}

browser.runtime.onStartup.addListener(start);
browser.runtime.onInstalled.addListener(start);

// The background page of the extension starts with the browser, the work
// begins right away.
start();
