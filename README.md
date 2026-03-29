
## 1. Project Structure

```
ai-agent/
├── src/
│   ├── server.js      ← Express HTTP server, Slack webhook receiver
│   ├── agent.js       ← Gemini agentic loop + Enso auth management
│   ├── mcpClient.js   ← Spawns mcp-server over stdio, calls tools
│   └── slack.js       ← Signature verification, postMessage, updateMessage
├── .env               ← All secrets (never commit this)
├── .gitignore
└── package.json
```

---

## 2. Prerequisites & Credentials

### 2.1 Enso API Keys

1. Log in at **https://app.getenso.ai**
2. Go to **Settings → Users**
3. Click **Create API Keys** — give them a name
4. Copy **Client Key** and **Client Secret** (or download the CSV)
5. Your `ENSO_USERNAME` is your Enso login email

### 2.2 Gemini API Key

1. Open **https://aistudio.google.com**
2. Click **Get API Key → Create API key**
3. Copy the key → `GEMINI_API_KEY`

### 2.3 Slack Tokens (only 2 needed — no SLACK_APP_TOKEN)

> **Why no `SLACK_APP_TOKEN`?**
> `SLACK_APP_TOKEN` (xapp-) is only needed for **Socket Mode** — where the
> Bolt library opens a persistent WebSocket *from your server to Slack*.
> This project uses plain **webhooks** instead: Slack POSTs events *to your
> server*. You verify the signature and reply. No persistent connection,
> no third token.

Steps:

1. Go to **https://api.slack.com/apps → Create New App → From Scratch**
2. Name it and pick your workspace
3. **OAuth & Permissions → Bot Token Scopes** — add:
   - `chat:write`
   - `chat:write.public`
   - `im:history`
   - `channels:history`
4. Click **Install to Workspace → Allow**
5. Copy **Bot User OAuth Token** (starts with `xoxb-`) → `SLACK_BOT_TOKEN`
6. **Basic Information → App Credentials** → copy **Signing Secret** → `SLACK_SIGNING_SECRET`

---

## 3. Installation & .env Setup

```bash
cd ai-agent
npm install
```

Open `.env` and fill in every value:

```env
# ── Enso ──────────────────────────────────────────────────────
ENSO_BASE_URL=
ENSO_CLIENT_KEY=your_client_key_here        # from app.getenso.ai
ENSO_CLIENT_SECRET=your_client_secret_here  # from app.getenso.ai
ENSO_USERNAME=your_email@example.com        # your Enso login email

# ── Gemini ────────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here     # from aistudio.google.com
GEMINI_MODEL=gemini-2.5-flash

# ── Slack ─────────────────────────────────────────────────────
SLACK_BOT_TOKEN=xoxb-...                    # OAuth & Permissions
SLACK_SIGNING_SECRET=...                    # Basic Information

# ── MCP Server ────────────────────────────────────────────────
MCP_SERVER_PATH=/absolute/path/to/mcp-server/src/server.js

# ── Express ───────────────────────────────────────────────────
PORT=4000
```

---

## 4. Start the Agent

```bash
npm start
```

Expected output:

```
🔌 Spawning MCP server: /path/to/mcp-server/src/server.js
✅ MCP server connected
📦 Loaded 18 MCP tools

🤖 Enso AI Agent running
   → Webhook:  http://localhost:4000/slack/events
   → Model:    gemini-2.5-flash
```

> **Note:** The agent does NOT login at startup. Authentication happens
> automatically on the **first Slack message** — `enso_login` is called
> then, and the token is refreshed automatically before it expires.

---

## 5. Expose with ngrok + Configure Slack

### Step 1 — Run ngrok (in a NEW terminal, keep agent running)

```bash
ngrok http 4000
```

ngrok prints:

```
Forwarding   https://a1b2-203-0-113-42.ngrok-free.app -> http://localhost:4000
```

Copy that `https://...ngrok-free.app` URL.

> ⚠️ **Free ngrok URLs change every time you restart ngrok.**
> You must update the Slack URL each restart.
> For a stable URL: `ngrok http --domain=your-name.ngrok-free.app 4000`
> (free static domain available after adding an authtoken).

https://intermetatarsal-nondissipatedly-pearl.ngrok-free.dev/slack/events

### Step 2 — Register URL in Slack

1. **api.slack.com/apps → your app → Event Subscriptions**
2. Toggle **Enable Events** to **ON**
3. In **Request URL** paste:
   ```
   https://e.app/slack/events
   ```
4. Slack immediately sends a `url_verification` challenge.
   Your server responds with the challenge value → Slack shows ✓ **Verified**

5. Scroll down → **Subscribe to bot events → Add Bot User Event:**
   - `message.im` — direct messages to the bot
   - `message.channels` — messages in channels where bot is added
6. Click **Save Changes**
7. Reinstall the app when prompted

### Step 3 — Add the bot to a channel (for channel messages)

```
/invite @YourBotName
```

Or just DM the bot directly.

---


### Tool categories in the MCP server

| Tool file | Tools it provides | Enso endpoints used |
|---|---|---|
| `auth.tools.js` | `enso_login`, `enso_refresh_token`, `enso_auth_status` | `/auth/system-login`, `/auth/refresh` |
| `contract.tools.js` | list, get, create, update contracts | `/contracts` |
| `customer.tools.js` | list, get, create, update customers | `/customers` |
| `entities.tools.js` | list, get entities | `/entities` |
| `invoice.tools.js` | list, get, create invoices | `/invoices` |
| `metering.tools.js` | submit, list usage records | `/metering` |
| `registry.js` | registers all tools with the MCP server | — |

Gemini sees all of these as a flat list of function declarations. It picks
whichever tool(s) it needs based on the user's request and the tool descriptions.

---
