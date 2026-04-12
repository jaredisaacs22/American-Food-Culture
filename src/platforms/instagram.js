const axios = require('axios');
const { env } = require('../config/env');

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Post a photo + caption to Instagram via the Graph API.
 *
 * Instagram Graph API flow (two-step):
 *   1. Create a media container with the image URL and caption
 *   2. Publish the container
 *
 * REQUIREMENTS:
 *   - Instagram Professional (Business or Creator) account
 *   - Connected to a Facebook Page
 *   - Facebook App with instagram_basic + instagram_content_publish permissions
 *   - A long-lived Page Access Token
 *   - The image must be hosted at a publicly accessible URL
 */
async function postToInstagram({ imageUrl, caption }) {
  const { accessToken, accountId } = env.instagram;

  // Step 1: Create media container
  console.log('  [Instagram] Creating media container...');
  const createRes = await axios.post(`${GRAPH_API}/${accountId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });

  const containerId = createRes.data.id;
  console.log(`  [Instagram] Container created: ${containerId}`);

  // Step 2: Wait for container to be ready (can take a few seconds)
  await waitForContainer(containerId, accessToken);

  // Step 3: Publish
  console.log('  [Instagram] Publishing...');
  const publishRes = await axios.post(`${GRAPH_API}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });

  const postId = publishRes.data.id;
  console.log(`  [Instagram] Published! Post ID: ${postId}`);

  return { postId, platform: 'instagram' };
}

/**
 * Post a carousel (multiple images) to Instagram
 */
async function postCarouselToInstagram({ imageUrls, caption }) {
  const { accessToken, accountId } = env.instagram;

  // Step 1: Create individual image containers
  const childIds = [];
  for (const url of imageUrls) {
    const res = await axios.post(`${GRAPH_API}/${accountId}/media`, {
      image_url: url,
      is_carousel_item: true,
      access_token: accessToken,
    });
    childIds.push(res.data.id);
  }

  // Step 2: Create carousel container
  const carouselRes = await axios.post(`${GRAPH_API}/${accountId}/media`, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: accessToken,
  });

  const containerId = carouselRes.data.id;
  await waitForContainer(containerId, accessToken);

  // Step 3: Publish
  const publishRes = await axios.post(`${GRAPH_API}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });

  return { postId: publishRes.data.id, platform: 'instagram' };
}

/**
 * Poll the container status until it's ready to publish
 */
async function waitForContainer(containerId, accessToken, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await axios.get(`${GRAPH_API}/${containerId}`, {
      params: {
        fields: 'status_code',
        access_token: accessToken,
      },
    });

    if (res.data.status_code === 'FINISHED') return;
    if (res.data.status_code === 'ERROR') {
      throw new Error(`Instagram container ${containerId} failed processing`);
    }

    // Wait 2 seconds before checking again
    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error(`Instagram container ${containerId} timed out`);
}

/**
 * Upload an image to Cloudinary and return the public URL.
 * Instagram Graph API requires images to be at a public URL.
 */
async function uploadImageToCloudinary(imagePath) {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;

  if (!cloudName || !apiKey) {
    throw new Error(
      'Cloudinary credentials not set. Instagram requires images at a public URL.\n' +
      'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env'
    );
  }

  const FormData = require('form-data');
  const fs = require('fs');
  const crypto = require('crypto');

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha256')
    .update(`timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp.toString());
  form.append('signature', signature);

  const res = await axios.post(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    form,
    { headers: form.getHeaders() }
  );

  return res.data.secure_url;
}

module.exports = { postToInstagram, postCarouselToInstagram, uploadImageToCloudinary };
