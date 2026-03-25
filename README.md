# Hacker News Digest Bot

A Telegram bot that sends a digest of relevant Hacker News posts every 5 hours.

## Features

- Fetches top 20 stories from Hacker News API
- Filters by keywords: `ai`, `react`, `angular`, `startup`
- Only includes posts with score ≥ 50
- Deduplicates posts using KV (48-hour TTL)
- Sends formatted digest to Telegram

## Setup

### Prerequisites

- Cloudflare Workers account
- Telegram bot (create via @BotFather)
- Telegram chat ID

### Installation

```bash
npm install
```

### Configuration

1. Create KV namespace:
```bash
npx wrangler kv namespace create HN_CACHE
```

2. Update `wrangler.jsonc` with KV namespace ID

3. Set secrets:
```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put CHAT_ID
```

4. Deploy:
```bash
npx wrangler deploy
```

## Local Development

```bash
npm run dev
```

Test scheduled handler:
```bash
curl "http://localhost:8787/__scheduled?cron=0+*/5+*+*+*"
```

## Schedule

Runs every 5 hours (00:00, 05:00, 10:00, 15:00, 20:00 UTC)

## Architecture

- **Runtime**: Cloudflare Workers (Free tier)
- **Storage**: Workers KV for deduplication
- **APIs**: Hacker News API, Telegram Bot API
- **Language**: TypeScript

## License

MIT
