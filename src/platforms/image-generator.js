const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const { retry } = require('../utils/retry');

/**
 * Generate an image using OpenAI's DALL-E 3 API.
 * Returns a public URL (valid for ~1 hour) — upload to Cloudinary for persistence.
 */
async function generateImage(prompt) {
  const response = await retry(() =>
    axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      },
      {
        headers: {
          Authorization: `Bearer ${env.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    ),
    { attempts: 3, delayMs: 5000, label: 'DALL-E image generation' }
  );

  const imageUrl = response.data.data[0].url;
  const revisedPrompt = response.data.data[0].revised_prompt;

  console.log(`  [Image] Generated successfully`);
  if (revisedPrompt) {
    console.log(`  [Image] DALL-E revised prompt: ${revisedPrompt.substring(0, 100)}...`);
  }

  return { imageUrl, revisedPrompt };
}

/**
 * Download image from URL to a local temp file.
 * Useful for Twitter upload (requires file path) or local backup.
 */
async function downloadImage(url, filename) {
  const outputDir = path.join(__dirname, '..', '..', 'output', 'images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, filename);
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  fs.writeFileSync(filePath, response.data);

  console.log(`  [Image] Downloaded to: ${filePath}`);
  return filePath;
}

module.exports = { generateImage, downloadImage };
