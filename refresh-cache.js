const https = require('https');

const SUPABASE_URL = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

function makeGraphQLRequest(query) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'ulsxqlsgkgfhuahscars.supabase.co',
      port: 443,
      path: '/graphql/v1',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ body: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000);
    req.write(JSON.stringify({ query }));
    req.end();
  });
}

async function testInsertViaGraphQL() {
  console.log('Attempting insert via GraphQL API...\n');

  const query = `
mutation {
  softwareCollection(first: 1) {
    edges {
      node {
        id
        name
      }
    }
  }
}
  `;

  try {
    const result = await makeGraphQLRequest(query);
    console.log('GraphQL Response:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

testInsertViaGraphQL();
