// The setup of the profile of the fork.
//
// The extension of Hoppscotch is installed by the policy of the browser, but
// it is turned off at the start, so that it does not eat the memory of the
// machine. The user turns it on with two clicks, in the menu of the
// extensions. The bookmark of Hoppscotch is put on the panel of the bookmarks
// as well.

const HOPPSCOTCH_ID = "postwoman-firefox@postwoman.io";
const HOPPSCOTCH_URL = "https://hoppscotch.io";

// How long the extension waits for the extension of Hoppscotch, the policy of
// the browser installs it from the network and it can take a while.
const WAIT_FOR_ADDON_MS = 120000;
const CHECK_EVERY_MS = 3000;

/** The bookmark of Hoppscotch is put on the panel of the bookmarks. */
async function addBookmark() {
  try {
    const toolbar = await browser.bookmarks.getSubTree("toolbar____");
    const exists = toolbar.children.some(
      (child) => child.url === HOPPSCOTCH_URL || child.title === "Hoppscotch",
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

browser.runtime.onStartup.addListener(() => {
  waitAndBookmark();
  waitAndDisable();
});

browser.runtime.onInstalled.addListener(() => {
  waitAndBookmark();
  waitAndDisable();
});

// The background page of the extension starts with the browser, the work
// begins right away.
waitAndBookmark();
waitAndDisable();
