// The color picker of the fork. The button of the toolbar starts the pick,
// the page asks for the pixel with the EyeDropper api of the browser and the
// result is shown in an overlay with the three formats of the color.

const OVERLAY_ID = "librewolf-colorpicker-overlay";
const FORMAT_KEY = "librewolf-colorpicker-format";

/** The formats the color can be copied in. */
const FORMATS = ["hex", "rgb", "hsl"];

async function currentFormat() {
  const stored = await browser.storage.local.get(FORMAT_KEY);
  return stored[FORMAT_KEY] || "hex";
}

/** Converts the color of the EyeDropper api into the requested format. */
function formatColor(srgbHex, format) {
  const r = parseInt(srgbHex.slice(1, 3), 16);
  const g = parseInt(srgbHex.slice(3, 5), 16);
  const b = parseInt(srgbHex.slice(5, 7), 16);

  if (format === "rgb") {
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (format === "hsl") {
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
    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }

  return srgbHex.toUpperCase();
}

/**
 * Puts the text into the buffer of the system.
 *
 * The background page of the extension is always allowed to write into the
 * buffer, a page is only allowed to do it when the address is safe.
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
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

browser.browserAction.onClicked.addListener(async () => {
  const format = await currentFormat();
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    return;
  }

  try {
    await sendToPage(tab.id, {
      type: "librewolf-colorpicker-start",
      format,
    });
  } catch (error) {
    console.error("The color picker could not be started", error);
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "librewolf-colorpicker-copy") {
    const copied = await copyText(message.text);
    return { ok: copied };
  }
  return undefined;
});
