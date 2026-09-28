const https = require('https');

function makeRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'ulsxqlsgkgfhuahscars.supabase.co',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        'apikey': process.env.SUPABASE_SECRET_KEY
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function verifyColumns() {
  console.log('Verifying actual database columns...\n');
  
  // Attempt to query information_schema
  const queries = [
    'SELECT column_name FROM information_schema.columns WHERE table_name = \'software\' AND table_schema = \'public\'',
    'SELECT column_name FROM information_schema.columns WHERE table_name = \'software\'',
    'PRAGMA table_info(software)',
    'DESC software'
  ];

  for (const sqlQuery of queries) {
    console.log(`Trying: ${sqlQuery.substring(0, 50)}...`);
    try {
      const response = await makeRequest(
        '/rest/v1/rpc/query',
        'POST',
        { sql: sqlQuery }
      );
      
      console.log(`Status: ${response.status}`);
      console.log(`Response:`, JSON.stringify(response.data).substring(0, 200));
      console.log('');
    } catch (err) {
      console.log(`Error: ${err.message}\n`);
    }
  }
}

verifyColumns();
