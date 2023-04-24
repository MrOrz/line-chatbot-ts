# line-chatbot-ts
Simple LINE chatbot in TS w/ chatgpt

## Development

### First-time setup
1. Copy-paste `.env.sample` to `.env` and fill in keys inside
2. Install dependencies using `npm i`

### Start server
1. Start peripherals using `docker-compose up`
2. Start server using `npm run dev`

## Deploy

The repository is hooked to Google cloud run.
Pushing new commits in main branch will be deployed to production automatically.
