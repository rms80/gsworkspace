# Local Installation Scripts

These scripts help you quickly set up and run gsworkspace on your local machine with local disk storage.

## Prerequisites

- **Node.js 18+** - Download from https://nodejs.org/

## Quick Start

### Windows

1. Double-click `configure-windows.bat` (or run from command prompt)
2. After configuration completes, double-click `launch-windows.bat`
3. Your browser will open to http://localhost:3000

### Linux

```bash
cd install/local
chmod +x configure-linux.sh launch-linux.sh
./configure-linux.sh
./launch-linux.sh
```

### macOS

```bash
cd install/local
chmod +x configure-macos.sh launch-macos.sh
./configure-macos.sh
./launch-macos.sh
```

## What the Scripts Do

### Configure Scripts

1. Check that Node.js and npm are installed
2. Install npm dependencies for both frontend and backend
3. Create `.env` configuration files with local storage mode enabled

### Launch Scripts

1. Start the backend server (port 4000)
2. Start the frontend server (port 3000)
3. Open your browser to the app

## Data Storage

By default, your scenes and media are stored in:
- **Windows**: `C:\Users\<username>\.gsworkspace\`
- **Linux/macOS**: `~/.gsworkspace/`

You can change this by editing `backend/.env` and setting `LOCAL_STORAGE_PATH`.

## AI Features (Optional)

To enable AI features (text generation, image generation, HTML generation), add your API keys to `backend/.env`:

```
ANTHROPIC_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
```

- Get an Anthropic API key at: https://console.anthropic.com/
- Get a Google AI API key at: https://makersuite.google.com/app/apikey

## Stopping the Servers

Press `Ctrl+C` in the terminal to stop both servers.

## Troubleshooting

### "Node.js is not installed"
Download and install Node.js from https://nodejs.org/

### "Failed to install dependencies"
- Check your internet connection
- Try running `npm cache clean --force` then run the install script again

### Port already in use
If port 3000 or 4000 is already in use, you can change them:
- Backend port: Edit `PORT` in `backend/.env`
- Frontend port: Edit `VITE_PORT` in `frontend/.env.local`
- API proxy port: Edit `VITE_API_PORT` in `frontend/.env.local` (must match backend `PORT`)
