// The bar of the page of Hoppscotch.
//
// The extension of Hoppscotch is off until the user turns it on. The bookmark
// of Hoppscotch is on the panel of the bookmarks, the user clicks it and the
// bar of this script is on the page: the user turns the extension on with the
// button of the bar. It is two clicks in all, and the bar of the page does not
// depend on the width of the window of the browser.

const BAR_ID = "librewolf-profile-bar";

/** Asks the background page for the state of the extension of Hoppscotch. */
async function readState() {
  try {
    return await browser.runtime.sendMessage({ type: "state" });
  } catch (error) {
    console.debug("The state of Hoppscotch could not be read", error);
    return null;
  }
}

/** The button of the bar. */
function makeButton(text, handler) {
  const button = document.createElement("button");
  button.textContent = text;
  button.style.cssText =
    "padding:6px 12px;border-radius:5px;border:1px solid #4a4a52;" +
    "background:#0060df;color:#ffffff;font:inherit;cursor:pointer";
  button.addEventListener("click", handler);
  return button;
}

/** The text of the bar. */
function makeText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  span.style.cssText = "flex:1";
  return span;
}

/** Shows the bar of the extension of the profile. */
function showBar(state) {
  if (document.getElementById(BAR_ID)) {
    return;
  }
  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.style.cssText =
    "display:flex;gap:12px;align-items:center;padding:10px 14px;" +
    "background:#1c1b22;color:#fbfbfe;font:13px system-ui,sans-serif;" +
    "border-bottom:1px solid #4a4a52";

  if (!state || !state.installed) {
    bar.appendChild(
      makeText("The extension of Hoppscotch is not installed yet."),
    );
  } else if (state.enabled) {
    bar.appendChild(makeText("The extension of Hoppscotch is on."));
    bar.appendChild(
      makeButton("Reload the page", () => window.location.reload()),
    );
  } else {
    bar.appendChild(makeText("The extension of Hoppscotch is off."));
    bar.appendChild(
      makeButton("Turn it on", async () => {
        const next = await browser.runtime.sendMessage({ type: "toggle" });
        bar.remove();
        showBar(next);
      }),
    );
  }
  document.body.prepend(bar);
}

async function start() {
  const state = await readState();
  if (state && !state.enabled) {
    showBar(state);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
