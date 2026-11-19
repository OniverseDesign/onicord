# Onicord MCP Server (`onicord-mcp`)

Onicord includes a built-in **Model Context Protocol (MCP)** server (`mcp-server/index.js`) that allows AI assistants (such as Antigravity IDE or Claude Desktop) to monitor, diagnose, and control running Onicord instances in real time.

## How It Works

The MCP server communicates over stdio with your AI client and scans local HTTP bridge ports `42884` through `42888`. It supports **multi-instance discovery** automatically—you can inspect all running Onicord windows side-by-side or filter requests by `user` nickname or `port`.

## Client Configuration

Add `onicord-mcp` to your MCP client configuration:

```json
{
  "mcpServers": {
    "onicord-mcp": {
      "command": "node",
      "args": ["path/to/onicord/mcp-server/index.js"]
    }
  }
}
```

Ensure dependencies inside `mcp-server/` are installed (`npm install` inside `mcp-server/`) and launch Onicord (`npm run start` in development).

## Available Tools

| Tool | Description | Key Parameters |
| :--- | :--- | :--- |
| **`onicord_get_live_logs`** | Inspect in-memory OniDiag diagnostic logs in real time across instances. | `user`, `port`, `limit`, `category`, `level`, `search` |
| **`onicord_request_peer_logs`** | Remotely fetch OniDiag logs from another P2P peer over the encrypted mesh. | `target` (required), `user` |
| **`onicord_clear_logs`** | Clear the in-memory OniDiag log buffer for clean test runs. | `user` |
| **`onicord_get_webrtc_stats`** | Query live P2P WebRTC connection metrics (RX/TX bitrates, audio packets, transceivers). | `user`, `port` |
| **`onicord_get_app_state`** | Inspect global application state (active P2P room, local user, connected peers, voice channel, media status). | `user`, `port` |
| **`onicord_trigger_action`** | Dispatch registered shortcuts and app actions (`toggle_mute`, `toggle_deafen`, `toggle_stream`, `disconnect_voice`, `switch_server_next`, `open_settings`). | `action` (required), `shortcut`, `user` |
| **`onicord_send_input_event`** | Simulate native Chromium keyboard events (`keyDown`, `keyUp`, `char`) on the active window. | `type`, `keyCode`, `modifiers`, `user` |
| **`onicord_join_voice_channel`** | Programmatically join a specific voice channel in the active room. | `channelId` (required), `user` |
| **`onicord_leave_voice_channel`** | Leave the active voice channel and release media devices. | `user` |
| **`onicord_toggle_media`** | Control mic, headphones, or screen sharing (`mute`, `unmute`, `deafen`, `undeafen`, `start_stream`, `stop_stream`). | `action` (required), `user` |

---

[Back to README](../../README.md)
