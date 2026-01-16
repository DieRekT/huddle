# Chrome Installation

Chrome installation requires sudo privileges. Please run manually:

```bash
# Add Google signing key
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -

# Add Chrome repository
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'

# Update and install
sudo apt-get update
sudo apt-get install -y google-chrome-stable
```

Alternatively, you can use Chromium (open source version):

```bash
sudo apt-get install -y chromium-browser
```

The demo scripts (`npm run demo`) will automatically detect and use Chrome or Chromium if available.

























