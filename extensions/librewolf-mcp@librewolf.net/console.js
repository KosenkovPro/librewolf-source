// The messages of the console of the page are kept, the agents of the command
// line read them. The file is put into the page only while an agent is
// connected to the browser.

(() => {
  if (window.__librewolfConsole) {
    // The messages are already kept in this page.
    return;
  }

  const messages = [];
  const limit = 500;

  window.__librewolfConsole = messages;

  /** The text of a message of the console. */
  const asText = (value) => {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  };

  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      try {
        messages.push({
          time: Date.now(),
          level,
          text: args.map(asText).join(" "),
        });
        if (messages.length > limit) {
          messages.shift();
        }
      } catch (error) {
        // The message is lost, the page must not break because of it.
      }
      original(...args);
    };
  }
})();
