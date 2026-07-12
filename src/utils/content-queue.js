const fs = require('fs');
const path = require('path');

const QUEUE_DIR = path.join(__dirname, '..', '..', 'queue');
const POSTED_DIR = path.join(__dirname, '..', '..', 'queue', 'posted');

/**
 * Content Queue — pre-generate posts for reliability.
 *
 * Instead of generating + posting in real-time (fragile),
 * we separate generation and posting into two phases:
 *
 * 1. FILL QUEUE:  Generate content ahead of time → save to queue/
 * 2. POST FROM QUEUE:  On schedule, take next item from queue → post → move to posted/
 *
 * This way, if Claude API is down at post time, you still have content ready.
 */

function ensureDirs() {
  if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
  if (!fs.existsSync(POSTED_DIR)) fs.mkdirSync(POSTED_DIR, { recursive: true });
}

/**
 * Add a generated content package to the queue
 */
function enqueue(contentPackage) {
  ensureDirs();

  const id = `${Date.now()}_${contentPackage.story.id}`;
  const filename = `${id}.json`;
  const filepath = path.join(QUEUE_DIR, filename);

  const queueItem = {
    id,
    createdAt: new Date().toISOString(),
    status: 'ready',
    ...contentPackage,
  };

  fs.writeFileSync(filepath, JSON.stringify(queueItem, null, 2));
  console.log(`  [Queue] Added: ${contentPackage.story.dish} (${filename})`);
  return id;
}

/**
 * Get the next item ready to post (oldest first)
 */
function dequeue() {
  ensureDirs();

  const files = fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .sort();

  for (const file of files) {
    const filepath = path.join(QUEUE_DIR, file);
    const item = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    if (item.status === 'ready') {
      return { ...item, _filepath: filepath, _filename: file };
    }
  }

  return null;
}

/**
 * Mark a queue item as posted and archive it
 */
function markPosted(item, results) {
  ensureDirs();

  const archived = {
    ...item,
    status: 'posted',
    postedAt: new Date().toISOString(),
    results,
  };

  delete archived._filepath;
  delete archived._filename;

  // Move to posted/
  const archivedPath = path.join(POSTED_DIR, item._filename);
  fs.writeFileSync(archivedPath, JSON.stringify(archived, null, 2));

  // Remove from queue
  if (fs.existsSync(item._filepath)) {
    fs.unlinkSync(item._filepath);
  }

  console.log(`  [Queue] Archived: ${item.story.dish}`);
}

/**
 * Mark as failed (keep in queue for retry with error info)
 */
function markFailed(item, error) {
  const updated = {
    ...item,
    status: 'ready',
    lastError: error,
    lastAttempt: new Date().toISOString(),
    attempts: (item.attempts || 0) + 1,
  };

  delete updated._filepath;
  delete updated._filename;

  fs.writeFileSync(item._filepath, JSON.stringify(updated, null, 2));
  console.log(`  [Queue] Marked for retry: ${item.story.dish} (attempt ${updated.attempts})`);
}

/**
 * Count items in queue
 */
function queueSize() {
  ensureDirs();
  return fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.')).length;
}

module.exports = { enqueue, dequeue, markPosted, markFailed, queueSize };
