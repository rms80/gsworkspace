# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Workspaceapp is an infinite canvas web application where users can:
- Drop images and text blocks onto a canvas
- Pan/zoom the canvas freely
- Select items via click or marquee selection
- Send selected content to Claude LLM with prompts for generation tasks

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
- Ignore everything in the /user_notes folder, this is just for humans and not relevant to development
