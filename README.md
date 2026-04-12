# American Food Culture — Social Media Automation

Automated content pipeline for the **American Food Culture** Instagram and Twitter/X accounts. Generates entertaining micro-stories about American food origins and "Americanized" dishes with a retro sleek theme.

## What It Does

1. **Story Database** — 15 curated American food origin stories (General Tso's, Buffalo Wings, Fortune Cookies, etc.)
2. **Content Generation** — Uses Claude API to write platform-specific posts in the brand voice
3. **Image Prompts** — Generates retro-themed image prompts for visual content creation
4. **Instagram Posting** — Posts photos + captions via the Instagram Graph API
5. **Twitter/X Posting** — Posts threaded stories via the Twitter API v2
6. **Scheduling** — Cron-based auto-posting with story rotation

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Credentials

```bash
cp .env.example .env
```

Edit `.env` with your API keys (see [Credentials Setup](#credentials-setup) below).

### 3. Preview Content

```bash
# List all available food stories
npm run preview -- stories

# Generate a preview for a specific story
node src/index.js generate general-tsos-chicken

# Generate for a random unposted story
node src/index.js generate
```

### 4. Post Content

```bash
# Post to Twitter/X
node src/index.js post twitter buffalo-wings

# Post to Instagram (requires image — see below)
node src/index.js post instagram buffalo-wings

# Post to all platforms
node src/index.js post all buffalo-wings
```

### 5. Run the Scheduler

```bash
# Runs on a cron schedule (default: 10am EST daily)
npm run schedule
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `node src/index.js stories` | List all food stories |
| `node src/index.js generate [id]` | Preview generated content |
| `node src/index.js post instagram [id]` | Post to Instagram |
| `node src/index.js post twitter [id]` | Post to Twitter/X |
| `node src/index.js post all [id]` | Post to all platforms |
| `node src/index.js image-prompt [id]` | Generate retro image prompt |

If no story ID is given, the system picks the next unposted story automatically.

## Credentials Setup

### Anthropic (Claude API) — Required

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Set `ANTHROPIC_API_KEY` in `.env`

### Twitter/X API

1. Apply for developer access at [developer.x.com](https://developer.x.com)
2. Create a Project and App
3. Enable OAuth 1.0a with **Read and Write** permissions
4. Generate all four tokens (API Key, API Secret, Access Token, Access Secret)
5. Set them in `.env`

### Instagram Graph API

Instagram posting requires more setup:

1. Create a [Facebook App](https://developers.facebook.com)
2. Add the **Instagram Graph API** product
3. Connect your Instagram Professional account to a Facebook Page
4. Generate a **long-lived Page Access Token** (valid 60 days)
5. Get your Instagram Business Account ID from the Graph API Explorer
6. Set `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_ACCOUNT_ID` in `.env`

**Image hosting:** Instagram requires images at a public URL. We support Cloudinary:
1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env`

### Refreshing Instagram Tokens

Instagram long-lived tokens expire after 60 days. Refresh before expiry:

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=YOUR_APP_ID&\
client_secret=YOUR_APP_SECRET&\
fb_exchange_token=YOUR_CURRENT_TOKEN"
```

## Instagram Image Workflow

Instagram requires an image for every post. Here's the recommended workflow:

1. **Generate the image prompt:**
   ```bash
   node src/index.js image-prompt buffalo-wings
   ```

2. **Create the image** using the generated prompt with your preferred tool:
   - [ChatGPT/DALL-E](https://chat.openai.com) — paste the prompt directly
   - [Midjourney](https://midjourney.com) — paste in Discord
   - Any image generation API

3. **Post to Instagram** programmatically:
   ```javascript
   const { postToInstagram } = require('./src/platforms/instagram');
   const { uploadImageToCloudinary } = require('./src/platforms/instagram');

   const imageUrl = await uploadImageToCloudinary('./my-image.png');
   await postToInstagram({ imageUrl, caption: '...' });
   ```

## Brand Identity

| Element | Value |
|---------|-------|
| **Colors** | Navy `#002F6C`, Red `#D72638`, Cream `#FAF8F5`, Mustard `#E8A317` |
| **Fonts** | Montserrat Bold (headings), Lato Regular (body) |
| **Visual Style** | Retro Americana, 1950s–70s diner aesthetic |
| **Voice** | Witty, proud, punchy — like a fun friend dropping food facts |

## Available Stories

| ID | Dish | Type |
|----|------|------|
| `general-tsos-chicken` | General Tso's Chicken | Americanized |
| `buffalo-wings` | Buffalo Wings | Origin |
| `fortune-cookie` | Fortune Cookie | Americanized |
| `pizza-american` | American Pizza | Americanized |
| `pb-and-j` | PB&J Sandwich | Origin |
| `california-roll` | California Roll | Americanized |
| `hot-dog` | Hot Dog | Origin |
| `tex-mex` | Tex-Mex | Americanized |
| `mac-and-cheese` | Mac and Cheese | Origin |
| `sriracha` | Sriracha | Americanized |
| `fried-chicken` | American Fried Chicken | Origin |
| `chicago-deep-dish` | Chicago Deep Dish | Origin |
| `thanksgiving-turkey` | Thanksgiving Turkey | Origin |
| `hawaiian-pizza` | Hawaiian Pizza | Americanized |
| `chimichanga` | Chimichanga | Americanized |

## Adding New Stories

Add entries to `src/stories/food-stories.json`:

```json
{
  "id": "your-story-id",
  "dish": "Dish Name",
  "category": "origin",
  "origin_hook": "The one-paragraph hook that makes people stop scrolling.",
  "key_facts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
  "era": "1950s",
  "vibe": "Visual description for image generation"
}
```

Category is either `"origin"` (born in America) or `"americanized"` (transformed by America).

## Project Structure

```
├── src/
│   ├── index.js                    # CLI entry point
│   ├── scheduler.js                # Cron-based auto-poster
│   ├── config/
│   │   ├── brand.js                # Brand identity (colors, fonts, voice)
│   │   └── env.js                  # Environment variable handling
│   ├── generators/
│   │   ├── story-generator.js      # Claude-powered content generation
│   │   └── image-prompt-generator.js # Retro image prompt generation
│   ├── platforms/
│   │   ├── instagram.js            # Instagram Graph API client
│   │   └── twitter.js              # Twitter/X API v2 client
│   ├── stories/
│   │   └── food-stories.json       # Curated food story database
│   └── utils/
│       └── story-picker.js         # Story selection + post history
├── .env.example                    # Environment template
├── package.json
└── README.md
```
