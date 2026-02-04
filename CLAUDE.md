# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gsworkspace is an infinite canvas web application where users can:
- Drop text blocks, images, and videos onto an infinite canvas
- Pan/zoom the canvas freely
- canvas objects can be selected via click or marquee selection, translated and resized
- The user can create LLM Prompt, ImageGen Prompt, and HTMLGen Prompt objects and configure which AI service will be called when they are run
- The Prompt objects generate new content - currently text, images or HTML blocks
- all content can be exported
- in online mode the scene and content synchronizes with a remote server, in offline mode it is stored locally



## Tech Stack

- **Frontend**: React + TypeScript + Vite + Konva (react-konva)
- **Backend**: Node.js + Express + TypeScript
- **Storage**: AWS S3 (public bucket)
- **LLM**: Anthropic Claude API, Google Gemini API

## Commands

### Frontend (in `/frontend`)
```bash
npm install          # Install dependencies
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
```

### Backend (in `/backend`)
```bash
npm install          # Install dependencies
npm run dev          # Start dev server on localhost:4000 (auto-reload)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled code
npm run lint         # Run ESLint
```

## Architecture

```
frontend/
  src/
    components/
      InfiniteCanvas.tsx  - Konva Stage with pan/zoom, items, selection
      Toolbar.tsx         - Top toolbar for actions
    types/
      index.ts            - TypeScript types for canvas items
    App.tsx               - Main app state management

backend/
  src/
    routes/
      items.ts            - CRUD endpoints for canvas state (S3 storage)
      llm.ts              - Claude API integration endpoint
    services/
      s3.ts               - S3 client wrapper
      claude.ts           - Anthropic SDK wrapper
    index.ts              - Express server setup
```

## Key Patterns

- Canvas items are typed as `TextItem | ImageItem` (discriminated union on `type` field)
- Frontend proxies `/api/*` requests to backend (configured in vite.config.ts)
- Images are stored as base64 data URLs locally; can be uploaded to S3 for persistence
- LLM requests send selected items (text content + images) along with user prompt

## Environment Variables

Copy `.env.example` to `.env` in the backend directory and fill in:
- `AWS_*` credentials and `S3_BUCKET_NAME` for storage
- `ANTHROPIC_API_KEY` for Claude API access


## Notes to CLAUDE
- Everything in the /user_notes folder is just for humans and not relevant to development. These files should still be committed to github but can be ignored by CLAUDE.

- Major work (eg a top-level TODO task) should always be done in a feature branch
- Never merge a feature branch back into main automatically, always ask me for confirmation
- Do not push the main branch unless I tell you to


