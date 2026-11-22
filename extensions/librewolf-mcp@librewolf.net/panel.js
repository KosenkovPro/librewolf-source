// The console of the agents: the state of the connection, the log, the task
// for the agent and the voice input.

const dot = document.getElementById("dot");
const statusLabel = document.getElementById("status");
const connectButton = document.getElementById("connect");
const logBox = document.getElementById("log");
const promptBox = document.getElementById("prompt");
const sendButton = document.getElementById("send");
const voiceButton = document.getElementById("voice");
const serverInput = document.getElementById("server");
const sttInput = document.getElementById("stt");
const saveButton = document.getElementById("save");

let recorder = null;
let recording = null;

function appendLog(entry) {
  const line = document.createElement("div");
  line.className = entry.level || "info";
  const time = new Date(entry.time || Date.now()).toLocaleTimeString();
  line.textContent = `${time} ${entry.text}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function setStatus(connected) {
  dot.classList.toggle("on", connected);
  statusLabel.textContent = connected ? "the agent is connected" : "not connected";
  connectButton.textContent = connected ? "Disconnect" : "Connect";
  connectButton.classList.toggle("primary", !connected);
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: "librewolf-mcp-get-state" });
  setStatus(state.connected);
  serverInput.value = state.settings.server;
  sttInput.value = state.settings.stt;
  logBox.textContent = "";
  for (const entry of state.log) {
    appendLog(entry);
  }
  return state;
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "librewolf-mcp-event") {
    return;
  }
  if (message.event === "status") {
    setStatus(message.connected);
  } else if (message.event === "log") {
    appendLog(message.entry);
  } else if (message.event === "prompt") {
    promptBox.value = message.text;
  } else if (message.event === "message") {
    appendLog({ time: Date.now(), level: "info", text: JSON.stringify(message.message) });
  }
});

connectButton.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({ type: "librewolf-mcp-get-state" });
  if (state.connected) {
    await browser.runtime.sendMessage({ type: "librewolf-mcp-disconnect" });
  } else {
    await browser.runtime.sendMessage({ type: "librewolf-mcp-connect" });
  }
  await refresh();
});

saveButton.addEventListener("click", async () => {
  await browser.runtime.sendMessage({
    type: "librewolf-mcp-set-settings",
    settings: { server: serverInput.value, stt: sttInput.value },
  });
  await refresh();
});

async function sendPrompt() {
  const text = promptBox.value.trim();
  if (!text) {
    return;
  }
  await browser.runtime.sendMessage({ type: "librewolf-mcp-prompt", text });
  appendLog({ time: Date.now(), level: "info", text: `sent to the agent: ${text}` });
}

sendButton.addEventListener("click", sendPrompt);

promptBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    sendPrompt();
  }
});

/** Records the voice and sends it to the speech to text service. */
voiceButton.addEventListener("click", async () => {
  if (recorder) {
    recorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      recorder = null;
      voiceButton.classList.remove("recording");
      voiceButton.textContent = "🎙 Voice";

      const blob = new Blob(chunks, { type: "audio/webm" });
      const buffer = await blob.arrayBuffer();
      try {
        const answer = await browser.runtime.sendMessage({
          type: "librewolf-mcp-transcribe",
          audio: buffer,
        });
        promptBox.value = answer.text || "";
      } catch (error) {
        appendLog({ time: Date.now(), level: "error", text: `the speech was not understood: ${error}` });
      }
    };
    recorder.start();
    voiceButton.classList.add("recording");
    voiceButton.textContent = "■ Stop";
  } catch (error) {
    appendLog({ time: Date.now(), level: "error", text: `the microphone is not available: ${error}` });
  }
});

// The panel asks the bridge to look for the server of the agents, the server
// is often started after the browser.
(async () => {
  const state = await refresh();
  if (!state.connected) {
    await browser.runtime.sendMessage({ type: "librewolf-mcp-connect" });
    await refresh();
  }
})();
