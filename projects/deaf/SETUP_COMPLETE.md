# Setup Complete: Ubuntu Desktop Integration & Cloudflare Tunnel

## ✅ What's Been Set Up

### 1. Ubuntu Desktop Integration
- **Desktop Entry**: `~/.local/share/applications/huddle.desktop`
- **App Icon**: PNG and SVG icons installed
- **App Launcher**: Search for "Huddle" in Activities menu

### 2. Cloudflare Tunnel Setup Scripts
- **Setup Script**: `./scripts/setup-tunnel-idview.sh` - Configures tunnel with idview.org
- **Tunnel Launcher**: `./scripts/start-tunnel.sh` - Starts tunnel only
- **App Launcher**: `./scripts/start-app.sh` - Starts both tunnel and server

### 3. QR Code & URL System
- ✅ QR codes automatically use Cloudflare tunnel URL
- ✅ Invite links automatically use tunnel URL
- ✅ Works whether accessing via localhost or tunnel URL

## 🚀 Quick Start

### First Time Setup (One-Time)

1. **Set up Cloudflare tunnel**:
   ```bash
   cd /home/lucifer/projects/deaf
   ./scripts/setup-tunnel-idview.sh
   ```
   
   This will:
   - Create a tunnel named "huddle"
   - Configure `huddle.idview.org` subdomain
   - Set up DNS routing
   - Update `.env` with `PUBLIC_BASE_URL=https://huddle.idview.org`

2. **Launch the app** (choose one):
   - **From Ubuntu menu**: Click Activities → Search "Huddle" → Click icon
   - **From terminal**: `./scripts/start-app.sh`

### Daily Use

Just launch the app from the Ubuntu Activities menu:
1. Press Super key (or click Activities)
2. Type "Huddle"
3. Click the Huddle icon

The app will automatically:
- Start the Cloudflare tunnel
- Start the server
- Display the public URL (e.g., `https://huddle.idview.org`)

## 📋 How It Works

### QR Code URL Resolution

The app uses a smart URL resolution system:

1. **QR Code Generation** (server-side):
   - Checks `PUBLIC_BASE_URL` from `.env` (set by setup script)
   - Falls back to Cloudflare tunnel headers if accessed via tunnel
   - Always generates HTTPS URL for QR codes

2. **Invite Links** (client-side):
   - If accessed via tunnel URL → uses that URL
   - If accessed via localhost → fetches `/api/network` to get `PUBLIC_BASE_URL`
   - Always uses HTTPS tunnel URL

3. **Result**: QR codes and invite links always show the correct public HTTPS URL

### Cloudflare Tunnel Configuration

- **Config File**: `~/.cloudflared/config.yml`
- **Tunnel Name**: `huddle` (default)
- **Domain**: `huddle.idview.org` (default)
- **Routes**: `huddle.idview.org` → `http://localhost:8787`

## 🔧 Customization

### Change Subdomain

To use a different subdomain (e.g., `deaf.idview.org`):
```bash
./scripts/setup-tunnel-idview.sh huddle deaf idview.org
```

### Change Tunnel Name

To use a different tunnel name:
```bash
./scripts/setup-tunnel-idview.sh my-tunnel-name
```

### Manual Control

**Start tunnel only**:
```bash
./scripts/start-tunnel.sh huddle
```

**Start server only**:
```bash
npm start
```

**Start both manually**:
```bash
# Terminal 1
./scripts/start-tunnel.sh huddle

# Terminal 2
npm start
```

## 📁 Files Created

### Desktop Integration
- `~/.local/share/applications/huddle.desktop` - Desktop entry
- `~/.local/share/icons/hicolor/256x256/apps/huddle.png` - PNG icon
- `~/.local/share/icons/hicolor/scalable/apps/huddle.svg` - SVG icon

### Cloudflare Tunnel
- `~/.cloudflared/config.yml` - Tunnel configuration
- `~/.cloudflared/<tunnel-id>.json` - Tunnel credentials

### Project Scripts
- `scripts/setup-tunnel-idview.sh` - Tunnel setup
- `scripts/start-tunnel.sh` - Tunnel launcher
- `scripts/start-app.sh` - Combined launcher
- `scripts/generate-icon.sh` - Icon generator

## 🐛 Troubleshooting

### App doesn't appear in menu
```bash
update-desktop-database ~/.local/share/applications/
# Log out and log back in
```

### QR code shows wrong URL
1. Check `.env` has `PUBLIC_BASE_URL=https://huddle.idview.org`
2. Restart the app after changing `.env`
3. Check tunnel is running: `ps aux | grep cloudflared`

### Tunnel won't start
1. Check tunnel exists: `./bin/cloudflared tunnel list`
2. Check config exists: `cat ~/.cloudflared/config.yml`
3. Check credentials: `ls ~/.cloudflared/*.json`

### Icon doesn't appear
```bash
cd /home/lucifer/projects/deaf
./scripts/generate-icon.sh
update-desktop-database ~/.local/share/applications/
```

## 📚 Documentation

- **Ubuntu Integration**: `docs/UBUNTU_DESKTOP_INTEGRATION.md`
- **Cloudflare Tunnel**: `docs/CLOUDFLARE_TUNNEL.md`
- **Quick Start**: `QUICKSTART.md`

## ✨ Features

✅ **Ubuntu App Tray Integration** - Launch from Activities menu
✅ **Cloudflare Tunnel** - Automatic HTTPS with idview.org domain
✅ **Dynamic QR Codes** - Always shows correct tunnel URL
✅ **Automatic URL Resolution** - Works via localhost or tunnel
✅ **One-Click Launch** - Start tunnel + server with single click
✅ **Icon Support** - PNG and SVG icons installed

## 🎯 Next Steps

1. **First Launch**: Run `./scripts/setup-tunnel-idview.sh` (one-time)
2. **Test**: Launch app from Activities menu
3. **Verify**: Check QR code shows `https://huddle.idview.org` URL
4. **Scan**: Test QR code on mobile device
5. **Enjoy**: App is ready for daily use!

---

**Note**: Make sure your Cloudflare account has access to manage DNS for `idview.org` domain. The setup script will prompt you to authenticate if needed.
















