import * as dotenv from 'dotenv';
dotenv.config();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const token = process.env.CLOUDFLARE_TOKEN_VALUE || '';
const bucket = process.env.R2_BUCKET_NAME || 'edukamba';

async function updateCors() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`;
  const body = {
    rules: [
      {
        allowed: {
          origins: [
            "http://localhost:8080",
            "http://localhost:8081",
            "http://localhost:8082",
            "http://localhost:5173",
            "http://127.0.0.1:8080",
            "http://127.0.0.1:8081",
            "http://127.0.0.1:8082",
            "http://127.0.0.1:5173",
            "https://app.edukamba.com",
            "https://www.edukamba.com",
            "https://edukamba.com",
            "https://localhost",
            "capacitor://localhost",
            "ionic://localhost"
          ],
          methods: [
            "GET",
            "PUT",
            "HEAD",
            "POST",
            "DELETE"
          ],
          headers: [
            "*"
          ]
        },
        exposeHeaders: [
          "ETag"
        ],
        maxAgeSeconds: 3600
      }
    ]
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Update CORS response:', JSON.stringify(data, null, 2));
}

updateCors();
