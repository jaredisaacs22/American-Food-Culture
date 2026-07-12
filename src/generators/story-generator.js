const Anthropic = require('@anthropic-ai/sdk');
const { env } = require('../config/env');
const brand = require('../config/brand');

function getClient() {
  return new Anthropic({ apiKey: env.anthropic.apiKey });
}

const SYSTEM_PROMPT = `You are the voice of "${brand.name}" — an Instagram and Twitter account that tells
entertaining, punchy micro-stories about American food origins and "Americanized" dishes.

Brand voice:
- Conversational and witty, like a fun friend telling you a wild food fact over beers
- Proud of American food culture without being jingoistic
- Uses short punchy sentences. Sentence fragments are OK.
- Drops fun historical details that make people go "wait, seriously?"
- Never preachy, never boring, never generic food-blogger voice
- Slight retro tone — like a cool narrator from a 1960s documentary

Visual era: ${brand.visualStyle.era}
Mood: ${brand.visualStyle.mood}`;

/**
 * Generate an Instagram micro-story post from a food story
 */
async function generateInstagramPost(story) {
  const client = getClient();

  const hashtagPool = [
    ...brand.hashtags.core,
    ...brand.hashtags.engagement,
    ...brand.hashtags.retro,
    ...brand.hashtags.viral,
  ];

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Write an Instagram caption for this food story. Return ONLY the caption text, nothing else.

DISH: ${story.dish}
CATEGORY: ${story.category === 'americanized' ? 'Americanized dish (not originally American)' : 'American food origin story'}
HOOK: ${story.origin_hook}
KEY FACTS: ${story.key_facts.join('; ')}
ERA VIBE: ${story.era} — ${story.vibe}

FORMAT RULES:
- First line: A bold, scroll-stopping hook (8 words max). Use all caps or a strong statement.
- Then a line break.
- Body: 80–150 words. Tell the micro-story in a punchy, entertaining way. Use short paragraphs (1–3 sentences each). Include 2–3 of the key facts woven naturally into the narrative.
- End with a simple CTA like "Save this for your next food argument." or "Tag someone who needs to know this."
- After the CTA, add a line break then "—" then another line break.
- End with 15–20 hashtags from this pool (pick the most relevant): ${hashtagPool.join(' ')}
- You may add 2–3 dish-specific hashtags not in the pool.
- Use emoji sparingly — max 3–4 total, only where they add energy.`
      }
    ],
  });

  return message.content[0].text;
}

/**
 * Generate a Twitter/X post (single tweet or mini-thread) from a food story
 */
async function generateTwitterPost(story) {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Write a Twitter/X thread for this food story. Return ONLY the thread text, nothing else.

DISH: ${story.dish}
CATEGORY: ${story.category === 'americanized' ? 'Americanized dish' : 'American food origin'}
HOOK: ${story.origin_hook}
KEY FACTS: ${story.key_facts.join('; ')}

FORMAT RULES:
- Thread of 3–5 tweets. Number them 1/, 2/, etc.
- Tweet 1: Hook that makes you stop scrolling. Under 280 characters. No hashtags here.
- Tweets 2–4: One punchy fact or story beat per tweet. Under 280 chars each.
- Final tweet: A kicker — surprising callback, question, or mic-drop. Under 280 chars. Include 2–3 hashtags from: #AmericanFoodCulture #FoodHistory #FoodFacts #AmericanEats
- Separate each tweet with a blank line.
- Keep it tight. Every word earns its spot.`
      }
    ],
  });

  return message.content[0].text;
}

/**
 * Generate both platform posts for a given story
 */
async function generateAllContent(story) {
  const [instagram, twitter] = await Promise.all([
    generateInstagramPost(story),
    generateTwitterPost(story),
  ]);

  return { instagram, twitter, story };
}

module.exports = { generateInstagramPost, generateTwitterPost, generateAllContent };
