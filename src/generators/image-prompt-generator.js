const Anthropic = require('@anthropic-ai/sdk');
const { env } = require('../config/env');
const brand = require('../config/brand');

function getClient() {
  return new Anthropic({ apiKey: env.anthropic.apiKey });
}

/**
 * Generate a retro-themed image prompt for a food story.
 * This prompt can be used with any image generation API
 * (DALL-E, Midjourney, Flux, Stable Diffusion, etc.)
 */
async function generateImagePrompt(story) {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Generate an image generation prompt for a social media graphic about "${story.dish}".

CONTEXT: This is for the Instagram account "American Food Culture" which posts retro-styled micro-stories about American food origins.

VISUAL STYLE REQUIREMENTS:
- Aesthetic: ${brand.visualStyle.aesthetic}
- Era inspiration: ${brand.visualStyle.era}
- Style keywords: ${brand.visualStyle.keywords.join(', ')}
- Mood: ${brand.visualStyle.mood}
- Color palette: deep navy (${brand.colors.navy}), bold red (${brand.colors.red}), warm cream (${brand.colors.cream}), mustard gold (${brand.colors.mustard})

STORY VIBE: ${story.vibe}
ERA: ${story.era}

RULES:
- No text overlay in the image (captions handle text)
- No photographs of real people or faces
- Style: illustrated / graphic art, NOT photorealistic
- Square format (1:1 aspect ratio for Instagram)
- The food should be the hero of the image
- Include retro design elements (starbursts, halftone dots, vintage borders, etc.)

Return ONLY the image prompt, nothing else. Keep it under 150 words.`
      }
    ],
  });

  return message.content[0].text;
}

/**
 * Generate a simpler text-overlay graphic description
 * (for tools like Canva, or manual creation)
 */
function generateGraphicSpec(story) {
  return {
    headline: story.dish.toUpperCase(),
    subhead: story.category === 'americanized'
      ? 'NOT WHAT YOU THINK'
      : 'THE REAL STORY',
    factCallout: story.key_facts[0],
    era: story.era,
    palette: {
      background: brand.colors.navy,
      accent: brand.colors.red,
      text: brand.colors.cream,
      highlight: brand.colors.mustard,
    },
    font: brand.fonts.heading,
    style: `${brand.visualStyle.aesthetic} — ${brand.visualStyle.mood}`,
  };
}

module.exports = { generateImagePrompt, generateGraphicSpec };
