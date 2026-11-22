# The server of the agents for LibreWolf

The server speaks the Model Context Protocol on the standard input and the
standard output, so that the agents of the command line can start it. At the
same time it listens on the loopback interface for the browser: the built-in
extension of the console connects to it, receives the calls of the tools and
gives the answers back.

The server has no dependencies, it needs nothing but Node.js 18 or newer.

## The start of the server

```sh
node server.js
```

The address of the server can be changed with the environment:

- `LIBREWOLF_MCP_HOST` — the address of the server, `127.0.0.1` by default.
- `LIBREWOLF_MCP_PORT` — the port of the server, `8977` by default.
- `LIBREWOLF_MCP_TIMEOUT` — how long the agent waits for the answer of the
  browser, in milliseconds, 120000 by default.

## The start from an agent

The agents of the command line start the server themselves. The setting of
Claude Code, for example, is this:

```json
{
  "mcpServers": {
    "librewolf": {
      "command": "node",
      "args": ["/path/to/librewolf-source/mcp-server/server.js"]
    }
  }
}
```

## The tools of the browser

| The name         | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `tabs_list`      | Lists the tabs of the browser.                           |
| `tabs_create`    | Opens a new tab.                                         |
| `tabs_close`     | Closes a tab.                                            |
| `tabs_activate`  | Brings a tab to the front.                               |
| `navigate`       | Opens an address in a tab.                               |
| `evaluate`       | Runs the code in a tab and gives the result back.        |
| `click`          | Clicks the element that fits the selector.               |
| `screenshot`     | Takes a picture of the visible part of a tab.            |
| `console_logs`   | Gives the messages of the console of a tab.              |
| `network_requests` | Gives the last requests of the pages of the browser.   |

The console of the browser is in the side panel of the browser, the button of
the toolbar opens it. There the status of the connection is shown, the log of
the calls is written and the task of the agent can be written by hand or by
voice.

## The voice of the console

The voice of the console is sent to a service of the speech to text, the
address of it is set in the console. The service of
[whisper.cpp](https://github.com/ggerganov/whisper.cpp) with the server of it
fits:

```sh
./server -m models/ggml-base.en.bin --host 127.0.0.1 --port 8080
```

The sound is sent to the address as it is, without a format, the service must
take the sound of the microphone.
