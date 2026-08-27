---
name: Testing the TableTalk web port
description: How to run and end-to-end test the TableTalk Node/Express + Socket.IO web app locally in Chrome.
---

# Testing the TableTalk web port

## Overview

TableTalk is a Tauri-first app that is also served as a web app by `server/index.js` (Node/Express + Socket.IO). The frontend lives in `src/` and is served as static files. All backend state is in-memory, so a server restart resets users/posts/channels/messages.

## Devin Secrets Needed

None.

## One-time setup

1. `cd /home/ubuntu/repos/tabletalk`
2. `npm install` (Node/npm are expected to be available)
3. If anything is already listening on port 3000 or other stale Node processes are running, kill them first:
   ```bash
   kill $(lsof -t -i:3000) 2>/dev/null || true
   kill $(pgrep -f 'node server/index.js') 2>/dev/null || true
   ```

## Starting the app

```bash
cd /home/ubuntu/repos/tabletalk
npm run dev
# or: node server/index.js
```

The server prints `TableTalk web server running at http://localhost:3000`.

## Browser setup

- Open Chrome to `http://localhost:3000`.
- Maximize the window before running UI tests so the coordinate mapping used by `computer` actions is predictable.
- The app stores the current user in `localStorage` under the key `tabletalk_current_user`. To force the auth screen, open the browser console and run:
  ```js
  localStorage.clear(); location.reload();
  ```
- The backend does **not** seed users. If the test asks for `a@example.com` / `secret`, you must either:
  - register through the UI, or
  - pre-register via `curl`:
    ```bash
    curl -s -X POST http://localhost:3000/api/register \
      -H 'Content-Type: application/json' \
      -d '{"username":"TesterA","email":"a@example.com","password":"secret"}'
    ```
- The merged `main` branch hashes passwords with scrypt/salt and protects mutating endpoints (`POST /api/posts`, `DELETE /api/posts/:id`, `POST /api/messages`, `POST /api/channels`) with Bearer-token middleware. The frontend stores the token returned by `/api/register` or `/api/login` in `localStorage` (`tabletalk_current_user`) and sends it in `Authorization: Bearer <token>` headers via `authHeaders()` in `src/main.js`.
- After logout, the app uses a `uiInitialized` flag so DOM listeners are attached only once; logout/login cycles should therefore not duplicate click handlers.

## Coordinate mapping for `computer` actions

The display is usually 1600x1200 physical pixels but the `computer` tool works in a 1024x768 logical coordinate space. For an element whose `getBoundingClientRect()` is `(x, y, width, height)` relative to the viewport:

```text
viewport_top_offset = window.outerHeight - window.innerHeight  # typically ~87 px for Chrome toolbars
center_screen_x = x + width/2
center_screen_y = viewport_top_offset + y + height/2
logical_x = center_screen_x * 1024 / window.screen.width
logical_y = center_screen_y * 768 / window.screen.height
```

If the browser is not maximized or if DevTools is open, recalculate `viewport_top_offset`.

## Common testing flows

1. **Auth:** from the auth screen, use the Register or Login form. After success the sidebar shows `@<username>` and the current view switches to Timeline.
2. **Timeline (Letters):** type in `#post-input`, click **Letter**. The letter appears in `#timeline`. Like (`❤️`), Delete (`🗑️`), and Reletter (`🔁`) actions are event-delegated on `.post-action`.
3. **Channels:** click **Channels**, click a `#channel-list .channel-item`, create a new channel via `#create-channel-form`, and send a message with `#chat-input` + `#send-chat`. Channel messages support Markdown (bold/italic/strike/code/link/line breaks) after HTML escaping. New channels trigger a toast and switch the active channel.
4. **Search:** in the Search view, type in `#search-input` and click `#search-btn`. Results are split into **Letters** and **Messages** sections; letters are escaped, messages are Markdown-rendered safely.
5. **Profile:** opening Profile calls `loadUserPosts()` and renders the current user's letters/reletters in `#user-posts`.
6. **Mobile nav:** resize the browser window to ≤768px (e.g. 700x900) with `wmctrl`/`xdotool`, then verify the `#menu-toggle` hamburger appears and toggles `#sidebar` open/closed.

**Branch-specific notes:**
- On the `devin/letter-markdown-reletter` branch the timeline composer button is labeled **Letter**, search placeholder says **Search letters and messages...**, and timeline cards include a `🔁 Reletter` action that creates a `type: 'reletter'` card and updates the original card's reletter count live via socket.
- Markdown formatting is applied to channel chat messages and search **Messages** results, but not to timeline letter content or letter search results.

## Gotchas

- In-memory state means each test run should start with a fresh server and `localStorage.clear()`.
- If Chrome is not in the foreground, `browser_console` or `read_dom` may fail. A click inside the viewport usually focuses it.
- Resizing Chrome with `wmctrl` may require unmaximizing first:
  ```bash
  wmctrl -r "TableTalk" -b remove,maximized_vert,maximized_horz
  xdotool search --name "TableTalk" windowsize 700 900
  ```
- `window.__TAURI__` is false in the browser, so `API_BASE` falls back to `/api` and `SOCKET_URL` is `undefined`, letting Socket.IO use the same host.
