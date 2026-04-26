# American Food Culture — Fully Automated Social Media

Zero-touch content pipeline for the **American Food Culture** Instagram and Twitter/X accounts. Generates retro-themed micro-stories about American food origins, creates DALL-E images, and posts automatically on a schedule.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  FILL (7am daily)                                       │
│  1. Pick next food story from database                  │
│  2. Generate Instagram caption + Twitter thread (Claude) │
│  3. Generate retro image prompt (Claude)                │
│  4. Create image (DALL-E 3)                             │
│  5. Upload to Cloudinary (public URL)                   │
│  6. Save to queue/                                      │
└─────────────────────────────┬───────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────┐
│  POST (10am daily)                                      │
│  1. Pull next item from queue/                          │
│  2. Post image + caption to Instagram (Graph API)       │
│  3. Post image + thread to Twitter/X (API v2)           │
│  4. Record to post history                              │
│  5. Archive to queue/posted/                            │
└─────────────────────────────────────────────────────────┘
```

The two-phase design means **if content generation fails at 7am, posting at 10am still works** from the pre-filled queue. You can also batch-fill days or weeks of content in advance.

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env   # Fill in API keys (see below)

# 3. Preview a post (generates content, no posting)
node src/index.js generate buffalo-wings

# 4. Full auto-post (generate + image + post to both platforms)
node src/index.js post all buffalo-wings

# 5. Or pre-fill a week of content, then let the scheduler post daily
node src/index.js queue fill 7
npm start
```

## Commands

| Command | What It Does |
|---------|-------------|
| `npm start` | Start the automated scheduler (fills + posts on cron) |
| `npm run start:fill` | Start scheduler + immediately fill one item |
| `npm run start:post` | Start scheduler + immediately post one item |
| `node src/index.js post all [id]` | One-shot: generate + image + post everywhere |
| `node src/index.js post instagram [id]` | One-shot: Instagram only |
| `node src/index.js post twitter [id]` | One-shot: Twitter only |
| `node src/index.js queue fill [count]` | Pre-generate N posts into the queue |
| `node src/index.js queue post` | Post next item from queue |
| `node src/index.js queue status` | Show queue size |
| `node src/index.js generate [id]` | Preview content (no posting) |
| `node src/index.js stories` | List all available stories |
| `node src/index.js image-prompt [id]` | Generate image prompt only |

## API Keys Required

You need **5 services** configured for full automation:

| Service | Purpose | Cost |
|---------|---------|------|
| **Anthropic** (Claude) | Content generation | ~$0.01/post |
| **OpenAI** (DALL-E 3) | Image generation | ~$0.04/image |
| **Cloudinary** | Image hosting (public URLs for Instagram) | Free tier works |
| **Instagram Graph API** | Post to Instagram | Free |
| **Twitter/X API** | Post threads to X | Free (Basic tier) |

**Total cost per post: ~$0.05** (content + image generation)

### Setup Steps

#### 1. Anthropic API Key
- Sign up at [console.anthropic.com](https://console.anthropic.com)
- Create an API key
- Set `ANTHROPIC_API_KEY` in `.env`

#### 2. OpenAI API Key (for DALL-E 3)
- Sign up at [platform.openai.com](https://platform.openai.com)
- Create an API key
- Set `OPENAI_API_KEY` in `.env`

#### 3. Cloudinary (free image hosting)
- Sign up at [cloudinary.com](https://cloudinary.com)
- Dashboard → Settings → get Cloud Name, API Key, API Secret
- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

#### 4. Instagram Graph API
1. Create a [Facebook App](https://developers.facebook.com/apps/)
2. Add **Instagram Graph API** product
3. Connect your **Instagram Professional account** to a Facebook Page
4. In Graph API Explorer, request these permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
5. Generate a **long-lived Page Access Token**:
   ```
   GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}
   ```
6. Get your Instagram Business Account ID:
   ```
   GET /{page-id}?fields=instagram_business_account
   ```
7. Set `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`
8. For auto-refresh: also set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

#### 5. Twitter/X API
1. Apply at [developer.x.com](https://developer.x.com)
2. Create a Project → App
3. Enable **OAuth 1.0a** with **Read and Write**
4. Generate: API Key, API Secret, Access Token, Access Token Secret
5. Set all four `TWITTER_*` variables in `.env`

## Running in Production

### Option A: PM2 (recommended for a VPS/server)

```bash
npm install -g pm2
pm2 start src/scheduler.js --name "afc-scheduler"
pm2 save
pm2 startup   # auto-restart on reboot
```

### Option B: Systemd (Linux server)

```ini
# /etc/systemd/system/afc-scheduler.service
[Unit]
Description=American Food Culture Scheduler
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/path/to/American-Food-Culture
ExecStart=/usr/bin/node src/scheduler.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable afc-scheduler
sudo systemctl start afc-scheduler
```

### Option C: Cron (simplest — no long-running process)

If you'd rather not keep a process alive, use system cron directly:

```bash
# Fill at 7am, post at 10am (EST)
0 7 * * * cd /path/to/American-Food-Culture && node src/index.js queue fill 1 >> logs/fill.log 2>&1
0 10 * * * cd /path/to/American-Food-Culture && node src/index.js queue post >> logs/post.log 2>&1
```

## Content Strategy: Pre-Fill a Week

For maximum reliability, pre-generate content in bulk:

```bash
# Generate a full week of posts
node src/index.js queue fill 7

# Check what's queued
node src/index.js queue status

# Start the scheduler — it'll just post from the queue daily
npm start
```

Each post uses a different story from the database. Stories rotate and aren't repeated until all 15 have been posted.

## Adding New Stories

Edit `src/stories/food-stories.json`:

```json
{
  "id": "your-story-id",
  "dish": "Dish Name",
  "category": "origin",
  "origin_hook": "The scroll-stopping hook paragraph.",
  "key_facts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
  "era": "1950s",
  "vibe": "Visual mood for image generation"
}
```

- `category`: `"origin"` (born in America) or `"americanized"` (transformed by America)
- `era`: Informs the retro visual style
- `vibe`: Directly shapes the DALL-E image prompt

## Available Stories (15)

| Dish | Type | Era |
|------|------|-----|
| General Tso's Chicken | Americanized | 1970s |
| Buffalo Wings | Origin | 1960s |
| Fortune Cookie | Americanized | 1940s |
| American Pizza | Americanized | 1950s |
| PB&J Sandwich | Origin | 1940s |
| California Roll | Americanized | 1960s |
| Hot Dog | Origin | 1910s |
| Tex-Mex | Americanized | 1950s |
| Mac and Cheese | Origin | 1930s |
| Sriracha | Americanized | 1980s |
| American Fried Chicken | Origin | 1800s–1950s |
| Chicago Deep Dish | Origin | 1940s |
| Thanksgiving Turkey | Origin | 1860s |
| Hawaiian Pizza | Americanized | 1960s |
| Chimichanga | Americanized | 1940s |

## Architecture

```
src/
├── index.js                       CLI entry point
├── scheduler.js                   Two-phase cron scheduler
├── config/
│   ├── brand.js                   Colors, fonts, visual style, hashtags
│   └── env.js                     Environment validation
├── generators/
│   ├── story-generator.js         Claude-powered Instagram + Twitter content
│   └── image-prompt-generator.js  Retro image prompt generation
├── platforms/
│   ├── instagram.js               Instagram Graph API (post, carousel, upload)
│   ├── twitter.js                 Twitter API v2 (tweet, thread, image)
│   └── image-generator.js         DALL-E 3 image generation
├── stories/
│   └── food-stories.json          15 curated food stories
└── utils/
    ├── story-picker.js            Story selection + post history
    ├── content-queue.js           Queue system (fill → post → archive)
    ├── retry.js                   Exponential backoff retry wrapper
    └── token-refresh.js           Instagram token auto-refresh
```

## Reliability Features

- **Two-phase pipeline** — Generation and posting are separate, so failures don't cascade
- **Content queue** — Pre-generate days/weeks of content as a buffer
- **Retry with backoff** — API calls retry 3x with exponential delay
- **Token auto-refresh** — Instagram tokens refreshed before 60-day expiry
- **Post history** — Tracks what's been posted; stories rotate without repeats
- **Failure recovery** — Failed queue items are kept for retry, not lost
