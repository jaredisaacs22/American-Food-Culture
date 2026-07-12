#!/bin/bash
# American Food Culture — One-Command Setup Script
# Run this from the project directory: bash setup.sh

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BOLD}🇺🇸  American Food Culture — Setup${NC}"
echo "=================================================="
echo ""

# ── Check dependencies ──────────────────────────────────────────────────────────

echo -e "${CYAN}Checking requirements...${NC}"

if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js not found.${NC}"
  echo "  Install from: https://nodejs.org  (LTS version recommended)"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}✗ Node.js v18+ required. You have v${NODE_VER}.${NC}"
  echo "  Upgrade at: https://nodejs.org"
  exit 1
fi

echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

if ! command -v npm &>/dev/null; then
  echo -e "${RED}✗ npm not found. Install Node.js from https://nodejs.org${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version)${NC}"

# ── Install dependencies ────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ── Set up .env ─────────────────────────────────────────────────────────────────

echo ""
if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠  .env already exists — skipping creation (edit it manually if needed)${NC}"
else
  cp .env.example .env
  echo -e "${GREEN}✓ Created .env from template${NC}"
fi

# ── Create required directories ─────────────────────────────────────────────────

mkdir -p queue/posted output/images logs
echo -e "${GREEN}✓ Created queue/, output/, logs/ directories${NC}"

# ── Interactive credential setup ─────────────────────────────────────────────────

echo ""
echo -e "${BOLD}API Key Setup${NC}"
echo "=================================================="
echo -e "You need credentials from 5 services."
echo -e "Press ${CYAN}Enter${NC} to skip any key you don't have yet — you can add them to ${BOLD}.env${NC} later."
echo ""

read_key() {
  local VAR_NAME=$1
  local PROMPT=$2
  local CURRENT
  CURRENT=$(grep "^${VAR_NAME}=" .env | cut -d= -f2-)

  # Skip if already set to a real value (not a placeholder)
  if [[ -n "$CURRENT" && "$CURRENT" != your_* && "$CURRENT" != sk-ant-xxx* && "$CURRENT" != sk-xxx* ]]; then
    echo -e "  ${GREEN}✓ ${VAR_NAME} already set${NC}"
    return
  fi

  echo -e "  ${PROMPT}"
  read -r -p "  > " VALUE
  if [[ -n "$VALUE" ]]; then
    # Replace the line in .env
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${VAR_NAME}=.*|${VAR_NAME}=${VALUE}|" .env
    else
      sed -i "s|^${VAR_NAME}=.*|${VAR_NAME}=${VALUE}|" .env
    fi
    echo -e "  ${GREEN}✓ Saved${NC}"
  else
    echo -e "  ${YELLOW}⟳ Skipped — add to .env later${NC}"
  fi
}

echo -e "${BOLD}1. Anthropic (Claude — content generation)${NC}"
echo -e "   Get key: ${CYAN}https://console.anthropic.com${NC}"
read_key "ANTHROPIC_API_KEY" "Paste your Anthropic API key (starts with sk-ant-):"
echo ""

echo -e "${BOLD}2. OpenAI (DALL-E 3 — image generation)${NC}"
echo -e "   Get key: ${CYAN}https://platform.openai.com/api-keys${NC}"
read_key "OPENAI_API_KEY" "Paste your OpenAI API key (starts with sk-):"
echo ""

echo -e "${BOLD}3. Cloudinary (image hosting — required for Instagram)${NC}"
echo -e "   Sign up free: ${CYAN}https://cloudinary.com${NC} → Dashboard → Settings → API Keys"
read_key "CLOUDINARY_CLOUD_NAME" "Cloudinary Cloud Name:"
read_key "CLOUDINARY_API_KEY" "Cloudinary API Key:"
read_key "CLOUDINARY_API_SECRET" "Cloudinary API Secret:"
echo ""

echo -e "${BOLD}4. Instagram Graph API${NC}"
echo -e "   Setup guide: ${CYAN}https://developers.facebook.com/docs/instagram-api/getting-started${NC}"
echo -e "   See INSTAGRAM_SETUP.md in this folder for step-by-step instructions."
read_key "INSTAGRAM_ACCESS_TOKEN" "Instagram Long-Lived Access Token:"
read_key "INSTAGRAM_ACCOUNT_ID" "Instagram Business Account ID:"
read_key "FACEBOOK_APP_ID" "Facebook App ID (for token auto-refresh):"
read_key "FACEBOOK_APP_SECRET" "Facebook App Secret:"
echo ""

echo -e "${BOLD}5. Twitter / X API${NC}"
echo -e "   Developer portal: ${CYAN}https://developer.x.com${NC}"
echo -e "   Create a project → app → enable OAuth 1.0a (Read + Write) → generate tokens"
read_key "TWITTER_API_KEY" "Twitter API Key:"
read_key "TWITTER_API_SECRET" "Twitter API Secret:"
read_key "TWITTER_ACCESS_TOKEN" "Twitter Access Token:"
read_key "TWITTER_ACCESS_SECRET" "Twitter Access Token Secret:"
echo ""

# ── Validate what we have ────────────────────────────────────────────────────────

echo "=================================================="
echo -e "${BOLD}Validating credentials...${NC}"
echo ""

check_var() {
  local VAR=$1
  local LABEL=$2
  local VALUE
  VALUE=$(grep "^${VAR}=" .env | cut -d= -f2-)
  if [[ -n "$VALUE" && "$VALUE" != your_* && "$VALUE" != sk-ant-xxx* && "$VALUE" != sk-xxx* ]]; then
    echo -e "  ${GREEN}✓ ${LABEL}${NC}"
    return 0
  else
    echo -e "  ${YELLOW}✗ ${LABEL} — not set${NC}"
    return 1
  fi
}

HAS_CONTENT=true
HAS_INSTAGRAM=true
HAS_TWITTER=true

check_var "ANTHROPIC_API_KEY" "Anthropic" || HAS_CONTENT=false
check_var "OPENAI_API_KEY" "OpenAI" || HAS_CONTENT=false
check_var "CLOUDINARY_CLOUD_NAME" "Cloudinary" || HAS_INSTAGRAM=false
check_var "CLOUDINARY_API_KEY" "Cloudinary API Key" || HAS_INSTAGRAM=false
check_var "INSTAGRAM_ACCESS_TOKEN" "Instagram Token" || HAS_INSTAGRAM=false
check_var "INSTAGRAM_ACCOUNT_ID" "Instagram Account ID" || HAS_INSTAGRAM=false
check_var "TWITTER_API_KEY" "Twitter API Key" || HAS_TWITTER=false
check_var "TWITTER_ACCESS_TOKEN" "Twitter Access Token" || HAS_TWITTER=false

echo ""

# ── Show what works ──────────────────────────────────────────────────────────────

echo "=================================================="
echo -e "${BOLD}What's ready:${NC}"
echo ""

if $HAS_CONTENT; then
  echo -e "  ${GREEN}✓ Content + image generation (Claude + DALL-E)${NC}"
else
  echo -e "  ${YELLOW}✗ Content generation — add ANTHROPIC_API_KEY and OPENAI_API_KEY to .env${NC}"
fi

if $HAS_INSTAGRAM; then
  echo -e "  ${GREEN}✓ Instagram posting${NC}"
else
  echo -e "  ${YELLOW}✗ Instagram — see INSTAGRAM_SETUP.md${NC}"
fi

if $HAS_TWITTER; then
  echo -e "  ${GREEN}✓ Twitter/X posting${NC}"
else
  echo -e "  ${YELLOW}✗ Twitter — add TWITTER_* keys to .env${NC}"
fi

echo ""

# ── Next steps ───────────────────────────────────────────────────────────────────

echo "=================================================="
echo -e "${BOLD}Next steps:${NC}"
echo ""

if $HAS_CONTENT; then
  echo -e "  ${CYAN}1. Preview a story (no posting):${NC}"
  echo "     node src/index.js generate buffalo-wings"
  echo ""
  echo -e "  ${CYAN}2. Pre-generate a week of content:${NC}"
  echo "     node src/index.js queue fill 7"
  echo ""
  echo -e "  ${CYAN}3. Start the automated scheduler:${NC}"
  echo "     npm start"
  echo ""
  echo -e "  ${CYAN}   Or post one right now:${NC}"
  echo "     node src/index.js post all"
else
  echo -e "  Add your API keys to ${BOLD}.env${NC}, then re-run:"
  echo "     node src/index.js generate"
fi

echo ""
echo -e "  ${CYAN}Need help with Instagram setup?${NC}"
echo "     cat INSTAGRAM_SETUP.md"
echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
