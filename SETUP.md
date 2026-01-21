# Development Environment Setup

## Prerequisites (Windows)

Install these using winget:

```bash
winget install GitHub.cli
winget install OpenJS.NodeJS.LTS
```

After installing, restart your terminal for the commands to be available.

## Verify Installation

```bash
gh --version
node --version
npm --version
```

## Project Setup

After cloning the repository:

```bash
cd frontend && npm install
cd ../backend && npm install
```

Copy `.env.example` to `backend/.env` and fill in:
- AWS credentials and S3 bucket name
- Anthropic API key

## Running the App

In separate terminals:

```bash
cd frontend && npm run dev    # http://localhost:3000
cd backend && npm run dev     # http://localhost:4000
```
