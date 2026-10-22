const fs = require('fs');
const https = require('https');
const path = require('path');

const apiKey = process.env.POSTMAN_API_KEY;
const collectionId =
  process.env.POSTMAN_COLLECTION_ID ||
  '58337625-2d718f97-1116-4ed7-94ab-72351b04aaad';

if (!apiKey) {
  console.error('❌ Error: POSTMAN_API_KEY environment variable is required.');
  console.error('Get an API key from: https://web.postman.co/settings/me/api-keys');
  process.exit(1);
}

const collectionPath = path.join(
  __dirname,
  '../docs/postman/StackHR.postman_collection.json',
);

if (!fs.existsSync(collectionPath)) {
  console.error(`❌ Error: Collection file not found at ${collectionPath}`);
  process.exit(1);
}

const rawCollection = fs.readFileSync(collectionPath, 'utf8');
const collectionData = JSON.parse(rawCollection);

const payload = JSON.stringify({ collection: collectionData });

console.log(`🚀 Syncing Postman collection (${collectionId})...`);

const req = https.request(
  {
    hostname: 'api.getpostman.com',
    path: `/collections/${collectionId}`,
    method: 'PUT',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  (res) => {
    let responseBody = '';
    res.on('data', (chunk) => (responseBody += chunk));
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ Postman collection and published docs updated successfully!');
      } else {
        console.error(
          `❌ Failed to update Postman collection (Status ${res.statusCode}):`,
          responseBody,
        );
        process.exit(1);
      }
    });
  },
);

req.on('error', (err) => {
  console.error('❌ Request error:', err);
  process.exit(1);
});

req.write(payload);
req.end();
