// The panel of the extension of the profile of the fork.
//
// It shows the state of the extension of Hoppscotch and turns it on or off.
// The user needs two clicks for that: the button of the extension in the
// panel of the browser and the button here.

const stateLine = document.getElementById("state");
const button = document.getElementById("toggle");
const note = document.getElementById("note");

/** Reads the state of the extension of Hoppscotch from the background page. */
async function readState() {
  try {
    return await browser.runtime.sendMessage({ type: "state" });
  } catch (error) {
    console.debug("The state of Hoppscotch could not be read", error);
    return null;
  }
}

/** Shows the state of the extension of Hoppscotch. */
function show(state) {
  if (!state) {
    stateLine.textContent = "The background page of the extension does not answer.";
    stateLine.classList.add("error");
    button.disabled = true;
    return;
  }
  stateLine.classList.remove("error");
  if (!state.installed) {
    stateLine.textContent =
      "The extension of Hoppscotch is not installed yet, it comes from the network.";
    button.disabled = true;
    button.textContent = "Turn on Hoppscotch";
    return;
  }
  if (state.enabled) {
    stateLine.innerHTML = "The extension of <b>Hoppscotch</b> is on.";
    button.textContent = "Turn it off";
  } else {
    stateLine.innerHTML = "The extension of <b>Hoppscotch</b> is off.";
    button.textContent = "Turn on Hoppscotch";
  }
  button.disabled = false;
}

async function render() {
  show(await readState());
}

button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const state = await browser.runtime.sendMessage({ type: "toggle" });
    show(state);
  } catch (error) {
    console.debug("The extension of Hoppscotch could not be turned", error);
    note.textContent = "The extension of Hoppscotch could not be turned.";
    note.classList.add("error");
    await render();
  }
});

render();
