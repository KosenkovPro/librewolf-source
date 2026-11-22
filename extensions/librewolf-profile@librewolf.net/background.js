// The setup of the profile of the fork.
//
// The extension of Hoppscotch is installed by the policy of the browser, but
// it is turned off at the start, so that it does not eat the memory of the
// machine. The user turns it on with two clicks, in the menu of the
// extensions. The bookmark of Hoppscotch is put on the panel of the bookmarks
// as well.

const HOPPSCOTCH_ID = "postwoman-firefox@postwoman.io";
const HOPPSCOTCH_URL = "https://hoppscotch.io";

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

/** Waits for the extension of Hoppscotch and turns it off. */
function waitAndDisable() {
  const started = Date.now();

  const tick = async () => {
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
