// The color picker of the fork.
//
// The browser has no api to take the color of a pixel of the page, the
// EyeDropper api of the standard of the web is not a part of Firefox. The
// picture of the visible part of the tab is taken instead, the page picks the
// pixel of it and shows the color of the pixel in the three formats.

const FORMAT_KEY = "librewolf-colorpicker-format";
const FORMATS = ["hex", "rgb", "hsl"];

/** The format the color was copied in the last time. */
async function currentFormat() {
  const stored = await browser.storage.local.get(FORMAT_KEY);
  return stored[FORMAT_KEY] || "hex";
}

/**
 * Puts the text into the buffer of the system.
 *
 * The background page of the extension is not in front, the new api of the
 * standard of the web refuses to work there. The old way is tried first, the
 * page of the extension copies the text itself.
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // The page is not in front, the old way is left.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch (error) {
    console.error("The color could not be copied", error);
    return false;
  }
}

/** Sends the message to the page, the script of the page is put in if needed. */
async function sendToPage(tabId, message) {
  try {
    await browser.tabs.sendMessage(tabId, message);
    return;
  } catch (error) {
    // The script of the page is not there yet, it is put in and tried again.
  }

  await browser.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  await browser.tabs.sendMessage(tabId, message);
}

/** Shows a short note on the button, the pages of the browser have no scripts. */
async function noteOnButton(tabId, text) {
  try {
    await browser.browserAction.setBadgeBackgroundColor({
      color: "#d70022",
      tabId,
    });
    await browser.browserAction.setBadgeText({ text, tabId });
    setTimeout(() => {
      browser.browserAction.setBadgeText({ text: "", tabId }).catch(() => {});
    }, 4000);
  } catch (error) {
    console.error("The note could not be shown", error);
  }
}

browser.browserAction.onClicked.addListener(async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    return;
  }

  try {
    // The picture of the visible part of the tab, without the parts of the
    // browser itself. The api of the browser has no number of a window, it
    // takes the tab that is in front of the window that is in front.
    const dataUrl = await browser.tabs.captureVisibleTab({
      format: "png",
    });

    await sendToPage(tab.id, {
      type: "librewolf-colorpicker-image",
      dataUrl,
      format: await currentFormat(),
    });
  } catch (error) {
    console.error("The color picker could not be started", error);
    await noteOnButton(tab.id, "!");
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "librewolf-colorpicker-copy") {
    const copied = await copyText(message.text);
    return { ok: copied };
  }
  return undefined;
});
