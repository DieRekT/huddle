# Permanent Cloudflare Tunnel Setup

## Overview
The app now defaults to using a **permanent Cloudflare tunnel** with a stable URL. This ensures QR codes always work and the URL never changes.

## Quick Setup (One-time)

1. **Install cloudflared** (if not already installed):
   ```bash
   ./scripts/install-cloudflared.sh
   ```

2. **Set up permanent tunnel**:
   ```bash
   ./scripts/setup-tunnel-idview.sh
   ```
   
   This will:
   - Log you into Cloudflare (if needed)
   - Create a permanent tunnel named "huddle"
   - Configure DNS for `huddle.idview.org` (or your domain)
   - Set `PUBLIC_BASE_URL` in `.env` automatically

3. **Start the app with permanent tunnel**:
   ```bash
   ./scripts/start-app.sh
   ```
   
   This starts both the permanent tunnel and server together.

## How It Works

### Permanent Tunnel (Default)
- ✅ **Stable URL**: Always `https://huddle.idview.org` (or your configured domain)
- ✅ **QR Codes**: Work every time, same URL across restarts
- ✅ **Auto-configured**: `PUBLIC_BASE_URL` is set in `.env` automatically
- ✅ **Production-ready**: Perfect for real use

### Temporary Tunnel (Testing Only)
- ⚠️ **Changing URL**: Different URL each time you start
- ⚠️ **QR Codes**: Don't work across restarts (URL changes)
- ⚠️ **Not recommended**: Only for quick testing

## Default Behavior

The app now **automatically uses the permanent tunnel** if it's configured:

- `./scripts/run.sh` - Checks for permanent tunnel and uses it if available
- `./scripts/run-with-tunnel-quick.sh` - Automatically uses permanent tunnel if configured, warns if using temporary
- `./scripts/start-app.sh` - Always uses permanent tunnel (recommended)

## QR Code Generation

QR codes **always use the permanent tunnel URL** (`PUBLIC_BASE_URL`) if configured:

1. **First**: Checks `PUBLIC_BASE_URL` from `.env` (set by setup script)
2. **Fallback**: Uses request headers (only if `PUBLIC_BASE_URL` not set)

This ensures QR codes always show the stable, permanent URL.

## Verification

Check if permanent tunnel is configured:

```bash
# Check tunnel config
cat ~/.cloudflared/config.yml

# Check PUBLIC_BASE_URL in .env
grep PUBLIC_BASE_URL .env

# List tunnels
./bin/cloudflared tunnel list
```

You should see:
- `~/.cloudflared/config.yml` exists with your tunnel configuration
- `.env` contains `PUBLIC_BASE_URL=https://huddle.idview.org` (or your domain)
- Tunnel appears in the tunnel list

## Troubleshooting

### QR Code Shows Wrong URL

**Problem**: QR code shows localhost or temporary URL instead of permanent tunnel URL.

**Solution**:
1. Verify `PUBLIC_BASE_URL` is set in `.env`:
   ```bash
   grep PUBLIC_BASE_URL .env
   ```
   Should show: `PUBLIC_BASE_URL=https://huddle.idview.org`

2. Restart the server after setting `PUBLIC_BASE_URL`

3. Check tunnel is running:
   ```bash
   ps aux | grep cloudflared
   ```

### Tunnel Not Starting

**Problem**: Permanent tunnel fails to start.

**Solution**:
1. Verify tunnel exists:
   ```bash
   ./bin/cloudflared tunnel list
   ```

2. Check tunnel config:
   ```bash
   cat ~/.cloudflared/config.yml
   ```

3. Check tunnel logs:
   ```bash
   tail -f /tmp/huddle-tunnel.log
   ```

### Need to Change Domain

**Problem**: Want to use a different domain/subdomain.

**Solution**:
1. Run setup script with your domain:
   ```bash
   ./scripts/setup-tunnel-idview.sh huddle mysubdomain mydomain.com
   ```
   
   Example: `./scripts/setup-tunnel-idview.sh huddle deaf idview.org`
   Creates: `https://deaf.idview.org`

2. Restart the app:
   ```bash
   ./scripts/start-app.sh
   ```

## Scripts Summary

| Script | Purpose | Uses Permanent Tunnel |
|--------|---------|----------------------|
| `start-app.sh` | **Recommended** - Start app with tunnel | ✅ Yes (always) |
| `run.sh` | Start server only (or auto-use tunnel if configured) | ✅ If configured |
| `setup-tunnel-idview.sh` | One-time setup of permanent tunnel | Sets it up |
| `start-tunnel.sh` | Start tunnel only | ✅ Yes |
| `tunnel-quick.sh` | Temporary tunnel (testing only) | ⚠️ No (warns) |
| `run-with-tunnel-quick.sh` | Server + temporary tunnel | ⚠️ Warns, prefers permanent |

## Best Practice

**Always use permanent tunnel for production**:

```bash
# One-time setup
./scripts/setup-tunnel-idview.sh

# Start app (uses permanent tunnel automatically)
./scripts/start-app.sh
```

This ensures:
- ✅ Stable URL for sharing
- ✅ QR codes always work
- ✅ No URL changes across restarts
- ✅ Production-ready setup







