# Ubuntu Desktop Integration

This guide explains how to use Huddle from the Ubuntu application menu.

## Quick Start

1. **Set up Cloudflare tunnel** (first time only):
   ```bash
   cd /home/lucifer/projects/deaf
   ./scripts/setup-tunnel-idview.sh
   ```
   This will:
   - Create a Cloudflare tunnel named "huddle"
   - Configure it to use `huddle.idview.org` (or custom subdomain)
   - Set up DNS routing
   - Update `.env` with `PUBLIC_BASE_URL`

2. **Launch the app**:
   - Click the Activities menu (top-left or Super key)
   - Search for "Huddle"
   - Click the Huddle icon

Or use the terminal:
   ```bash
   ./scripts/start-app.sh
   ```

## What Happens When You Launch

The app launcher (`start-app.sh`) will:
1. Start the Cloudflare tunnel (creates HTTPS URL at `huddle.idview.org`)
2. Start the Node.js server (listens on `localhost:8787`)
3. Display the public URL where the app is accessible
4. QR codes and invite links will automatically use the tunnel URL

## Files Created

- **Desktop Entry**: `~/.local/share/applications/huddle.desktop`
- **Icon**: `~/.local/share/icons/hicolor/256x256/apps/huddle.png`
- **Icon (SVG)**: `~/.local/share/icons/hicolor/scalable/apps/huddle.svg`

## Manual Setup (if needed)

### Desktop Entry Location
The desktop entry file is installed to:
```
~/.local/share/applications/huddle.desktop
```

To edit it:
```bash
nano ~/.local/share/applications/huddle.desktop
```

To remove it:
```bash
rm ~/.local/share/applications/huddle.desktop
```

### Icon Location
Icons are installed to:
```
~/.local/share/icons/hicolor/256x256/apps/huddle.png
~/.local/share/icons/hicolor/scalable/apps/huddle.svg
```

To update the icon:
```bash
cd /home/lucifer/projects/deaf
./scripts/generate-icon.sh
```

### Refresh Desktop Database
If the app doesn't appear in the menu after installation:
```bash
update-desktop-database ~/.local/share/applications/
```

## Troubleshooting

### App doesn't appear in menu
- Run: `update-desktop-database ~/.local/share/applications/`
- Log out and log back in
- Check file exists: `ls ~/.local/share/applications/huddle.desktop`

### Icon doesn't appear
- Check icon exists: `ls ~/.local/share/icons/hicolor/*/apps/huddle.*`
- Try regenerating: `./scripts/generate-icon.sh`
- Check permissions: `chmod 644 ~/.local/share/icons/hicolor/*/apps/huddle.*`

### App won't start
- Check tunnel is set up: `./scripts/setup-tunnel-idview.sh`
- Check Cloudflare credentials: `~/.cloudflared/config.yml`
- Check logs: `/tmp/huddle-tunnel.log` and `/tmp/huddle-server.log`

### QR code shows wrong URL
- Ensure `PUBLIC_BASE_URL` is set in `.env`
- Restart the app after changing `.env`
- Check tunnel is running: `ps aux | grep cloudflared`

## Customization

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

### Manual Tunnel Start
To start only the tunnel:
```bash
./scripts/start-tunnel.sh huddle
```

### Manual Server Start
To start only the server:
```bash
npm start
```

## Integration Details

### QR Code URL Resolution
The app uses `getPublicBaseUrl()` which:
1. **First**: Checks `PUBLIC_BASE_URL` environment variable (from `.env`)
2. **Fallback**: Uses Cloudflare tunnel headers (`x-forwarded-proto`, `x-forwarded-host`)
3. **Final**: Uses request host/protocol

This ensures QR codes always show the correct public HTTPS URL.

### Cloudflare Tunnel Configuration
Tunnel config is stored at:
```
~/.cloudflared/config.yml
```

This file routes `huddle.idview.org` → `http://localhost:8787`

### Environment Variables
Key variables in `.env`:
- `PUBLIC_BASE_URL=https://huddle.idview.org` - Used for QR codes/invite links
- `PORT=8787` - Server port (must match tunnel config)

## Notes

- The app requires both tunnel and server to run for full functionality
- The tunnel provides HTTPS which is required for mobile microphone access
- QR codes are generated server-side and always use the tunnel URL
- All invite links automatically use the tunnel URL via `PUBLIC_BASE_URL`
















