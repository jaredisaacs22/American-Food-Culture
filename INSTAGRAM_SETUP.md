# Instagram Graph API — Step-by-Step Setup

This is the most involved setup step, but only needs to be done once.
Takes about 15–20 minutes.

---

## What You Need Before Starting

- An **Instagram account** (personal is fine to start, but must be converted to Professional)
- A **Facebook account** (to create a Facebook Page and App)

---

## Step 1: Convert Instagram to a Professional Account

1. Open Instagram → your profile → ☰ Menu → **Settings and Privacy**
2. Scroll to **Account type and tools** → **Switch to Professional Account**
3. Choose **Business** or **Creator** (either works)
4. Complete the setup (category doesn't matter much — pick "Media/News Company")

---

## Step 2: Create a Facebook Page

You need a Facebook Page connected to your Instagram account.

1. Go to [facebook.com/pages/create](https://www.facebook.com/pages/create)
2. Choose **Business or Brand**
3. Name it **American Food Culture** (or anything — it won't be public-facing for this)
4. Skip adding photos/details for now

---

## Step 3: Connect Instagram to the Facebook Page

1. Go to your Facebook Page → **Settings** → **Linked Accounts** (or "Instagram")
2. Click **Connect Account** → log in with your Instagram credentials
3. Confirm the connection

---

## Step 4: Create a Facebook Developer App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click **Create App**
3. Choose **Business** → click Next
4. Give it a name (e.g., "AFC Poster") → enter your email → click **Create App**
5. From the App dashboard, find **Instagram Graph API** and click **Set Up**

---

## Step 5: Get Your Instagram Business Account ID

1. Go to the [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your App in the top dropdown
3. Set the Access Token to a **Page Access Token** for your Page
4. In the query box, enter:
   ```
   /me?fields=instagram_business_account
   ```
5. Click **Submit**
6. Copy the `id` value from the result — this is your `INSTAGRAM_ACCOUNT_ID`

---

## Step 6: Generate a Long-Lived Access Token

Short-lived tokens expire in 1 hour. You need a long-lived one (60 days).

### Get a Short-Lived Token First

1. In the [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Click **Generate Access Token**
3. Select your Page → grant permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
   - `pages_show_list`
4. Copy the short-lived token

### Exchange for a Long-Lived Token

Open your terminal and run (replace placeholders):

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=YOUR_APP_ID&\
client_secret=YOUR_APP_SECRET&\
fb_exchange_token=YOUR_SHORT_LIVED_TOKEN" | python3 -m json.tool
```

Copy the `access_token` from the response — this is your `INSTAGRAM_ACCESS_TOKEN`.

Your **App ID** and **App Secret** are on your app's dashboard under **Settings → Basic**.

---

## Step 7: Add to .env

```
INSTAGRAM_ACCESS_TOKEN=the_long_lived_token_from_step_6
INSTAGRAM_ACCOUNT_ID=the_id_from_step_5
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

---

## Token Refresh (Automatic)

Long-lived tokens expire after **60 days**. This app automatically refreshes them
7 days before expiry as long as `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set.

The refreshed token is stored in `.instagram-token.json` (gitignored).

---

## Testing Your Setup

After adding your credentials, test that everything works:

```bash
node -e "
const axios = require('axios');
const token = require('dotenv').config().parsed.INSTAGRAM_ACCESS_TOKEN;
const id = require('dotenv').config().parsed.INSTAGRAM_ACCOUNT_ID;
axios.get('https://graph.facebook.com/v21.0/' + id + '?fields=username,name&access_token=' + token)
  .then(r => console.log('Connected! Account:', r.data))
  .catch(e => console.error('Error:', e.response?.data || e.message));
"
```

You should see your Instagram username in the output.

---

## Common Errors

| Error | Fix |
|-------|-----|
| `OAuthException: Invalid OAuth access token` | Token expired — run setup.sh again to re-enter a fresh token |
| `Instagram account not connected to a Page` | Redo Step 3 — make sure your IG is linked to the Facebook Page |
| `Permission denied: instagram_content_publish` | Re-generate token in Graph Explorer with all 4 permissions selected |
| `Media container status: ERROR` | Image URL not publicly accessible — make sure Cloudinary upload succeeded |
