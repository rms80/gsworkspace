# gsworkspace

An infinite canvas webapp for combining text, images, videos, and AI-generated content in a freeform workspace. Can be deployed frontend-only, as a local client/server app, or with a remote server.

Design by [rms80](https://www.rms80.com), Coding by [Claude Code](https://claude.com/product/claude-code)

Check out **[gsworkspace.com](https://www.gsworkspace.com)** for more info, and a functional demo of Offline mode.

## Development Note

This project began as an experiment to see how far I could get trying to build a nontrivial web app using Claude Code (CC), without as little human intervention in the code as possible. I have provided architectural guidance and debugging help (ie breakpoints, console investigation, etc), but CC has generated all the code. Literally *all* of it. 

This is not a project where I gave CC a high-level spec and asked it to build the entire app. We have gone through hundreds of small incremental steps, adding features and fixing bugs over time. I have guided CC through significant refactors and architectural redesigns. 

CC and I have collaborated on many planning steps for larger chunks of work. I have accumulated the various TODO.md plans in user_notes/TODO_history.md. I have also kept a lot of my own notes in ryan_notes_to_self.txt.


## Overview

gsworkspace provides an infinite pan/zoom canvas where you can:
- Drop and arrange text blocks, images, and videos
- Select / move / resize objects
- Use AI prompts to generate text, images, or HTML content
- Built-in non-destructive editing for Images (crop) and Videos (crop/trim/speed/mute)
- Export and Import entire scenes, or individual parts

## Features

### Canvas & Objects
- **Infinite Canvas** - Pan and zoom without boundaries using mouse drag or scroll wheel
- **Text Blocks** - Add editable text, double-click to edit, auto-resizing
- **Images** - Drag-drop or paste from clipboard
- **Videos** - Drag-drop video files with playback controls (play/pause, seek, loop, mute)
- **Selection** - Click to select, Ctrl+click for multi-select, drag for marquee selection
- **Transform** - Move, resize
- **Edit** - Images (crop) and Videos (crop/trim/speed/mute). Edits are non-destructive and can be reverted.

### AI Integration
- **LLM Prompts** - Create prompt blocks that generate text output using Claude or Gemini
- **Image Generation** - Create image generation prompts using Gemini Nanobanana models
- **HTML Generation** - Generate formatted HTML/web pages from selected content with spatial awareness
- **Model Selection** - Choose between different AI models (Claude, Gemini)
- **Context Selection** - Select text and images to include as context for AI prompts

### Scene Management
- **Multiple Scenes** - Work with multiple scenes using a tabbed interface
- **Multiple Workspaces** - Workspaces are collections of Scenes
- **Auto-Save** - Automatic saving with debounce (1 second delay)
- **Undo/Redo** - Full undo/redo history with keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- **Export/Import** - Export scenes as ZIP archives or files, import from ZIP
- **Conflict Detection** - Automatic detection of remote changes with resolution options

### Storage Modes
- **Online (S3)** - Cloud storage using AWS S3 via remote server
- **Local Disk** - Store scenes on local filesystem via local server
- **Offline (Browser)** - Fully client-side storage using IndexedDB, with optional API key configuration for AI features


## Tech Stack

- **Frontend**: React + TypeScript + Vite + Konva (react-konva)
- **Backend**: Node.js + Express + TypeScript
- **Storage**: AWS S3 (cloud) or local filesystem
- **AI**: Anthropic Claude API, Google Gemini API

## Getting Started

### Prerequisites

Node.js 18+ and npm are required. Install Node.js for your platform:

```bash
[Windows]  winget install OpenJS.NodeJS.LTS
[MacOS]    brew install node
[Linux]    sudo apt install nodejs npm
```

### Run the Development Version

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install --prefix frontend && npm install --prefix backend
   ```

3. Configure environment variables:
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your settings
   ```

4. Start development servers (in separate terminals):
   ```bash
   npm run dev --prefix backend
   npm run dev --prefix frontend
   ```

5. Open http://localhost:3000 in your browser

### Windows App Installation

A batch script is provided that installs gsworkspace as a local app on Windows:

1. Ensure Node.js is installed (see Prerequisites above)
2. Run `install\local\install-windows-localappdata.bat`. This script will install and configure a copy of the app in your local user account at `%LocalAppData%\gsworkspace`.
4. Launch by searching for "gsworkspace" in the Start Menu
5. Optionally add your API keys to `%LocalAppData%\gsworkspace\backend\.env` for AI features

### Environment Variables

Backend `.env`:
```
# Storage mode: 'online' (S3) or 'local' (disk)
STORAGE_MODE=local

# AWS S3 (required for online mode)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=

# AI APIs
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Local storage path (for local mode, defaults to ~/.gsworkspace if empty)
LOCAL_STORAGE_PATH=
```


## License

[The Unlicense](https://unlicense.org) - Released into the public domain.

Please note that all code files in the project were fully generated by Claude Code. The U.S. Copyright Office has consistently held that purely AI-generated works are not copyrightable, because copyright requires human authorship.
