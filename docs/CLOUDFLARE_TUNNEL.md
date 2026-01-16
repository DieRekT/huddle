## Cloudflare Tunnel (HTTPS on phones + shareable link)

Why you need this:
- **Phones cannot open `http://localhost:8787`** (localhost points to the phone itself).
- Mobile browsers require **HTTPS** for microphone permissions (`getUserMedia`), unless you’re on localhost.
- Cloudflare Tunnel gives you a stable **HTTPS** URL and supports **WebSockets** (RoomBrief uses WebSockets).

### Option A (fastest): temporary URL (no DNS, no custom domain)

This gives you a random `trycloudflare.com` URL. Great for quick testing.

1) Install `cloudflared` (no sudo)

```bash
cd /home/lucifer/projects/deaf
./scripts/install-cloudflared.sh
./bin/cloudflared --version
```

2) Start RoomBrief (in one terminal)

```bash
cd /home/lucifer/projects/deaf
npm start
```

3) Start the tunnel (in another terminal)

```bash
./bin/cloudflared tunnel --url http://localhost:8787
```

4) Open the printed HTTPS URL on your laptop **and** phones.

Important: If you keep using `http://localhost:8787` on the laptop, invite links/QR may point to LAN/localhost. Use the **HTTPS tunnel URL** for the Viewer too.

---

### Option B (recommended): named tunnel + custom domain

This gives you a stable URL like `https://roombrief.example.com`.

Prereqs:
- You own a domain in Cloudflare DNS.
- You can run `cloudflared login` and approve in the browser.

1) Install `cloudflared` (no sudo)

```bash
cd /home/lucifer/projects/deaf
./scripts/install-cloudflared.sh
./bin/cloudflared --version
```

2) Authenticate

```bash
./bin/cloudflared tunnel login
```

3) Create a named tunnel

Pick a tunnel name (example: `roombrief`):

```bash
./bin/cloudflared tunnel create roombrief
```

This creates credentials under `~/.cloudflared/`.

4) Route a DNS hostname to the tunnel

Replace:
- `roombrief.example.com` with your hostname
- `roombrief` with your tunnel name

```bash
./bin/cloudflared tunnel route dns roombrief roombrief.example.com
```

5) Create config file

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: roombrief
credentials-file: /home/lucifer/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: roombrief.example.com
    service: http://localhost:8787
  - service: http_status:404
```

Tip: you can find the tunnel ID via:

```bash
./bin/cloudflared tunnel list
```

6) (Recommended) Set public base URL so invites always share the HTTPS hostname

Edit `/home/lucifer/projects/deaf/.env`:

```bash
PUBLIC_BASE_URL=https://roombrief.example.com
```

7) Run tunnel

```bash
./bin/cloudflared tunnel run roombrief
```

Now open `https://roombrief.example.com` on laptop + phones.

---

### WebSocket note

RoomBrief uses WebSockets; Cloudflare Tunnel supports this automatically. If you see connect/reconnect loops, ensure you are opening the **https** URL (not http) and the tunnel is running.

---

### Troubleshooting

- **Phones load a blank page / can’t connect**:
  - Make sure you are opening the **Cloudflare HTTPS URL**, not `localhost`.
  - Make sure the tunnel process is running and points to `http://localhost:8787`.

- **Mic won’t start on phones**:
  - You must use **HTTPS**. Tunnel fixes this.

- **Invite QR/link still points at localhost/LAN**:
  - Open the Viewer via the **tunnel URL**.
  - Or set `PUBLIC_BASE_URL` in `.env` and restart the server.

