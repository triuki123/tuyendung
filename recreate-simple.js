const https = require('https');

function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sql });
    
    const options = {
      hostname: 'ulsxqlsgkgfhuahscars.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        'apikey': process.env.SUPABASE_SECRET_KEY,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: responseBody
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(15000);
    req.write(body);
    req.end();
  });
}

async function recreateTablesSimple() {
  console.log('🔄 Recreating tables with simple schema...\n');

  const sqls = [
    `DROP TABLE IF EXISTS software CASCADE`,
    `CREATE TABLE software (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      vendor VARCHAR(255) NOT NULL
    )`
  ];

  for (const sql of sqls) {
    console.log(`Executing: ${sql.substring(0, 50)}...`);
    try {
      const result = await executeSQL(sql);
      console.log(`  Status: ${result.status}`);
      if (result.status >= 200 && result.status < 300) {
        console.log(`  ✅ Success\n`);
      } else {
        console.log(`  ⚠️  Response: ${result.body.substring(0, 100)}\n`);
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('Now testing insert...');
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    'https://ulsxqlsgkgfhuahscars.supabase.co',
    'REPLACE_WITH_LOCAL_SECRET'
  );

  const { data, error } = await supabase
    .from('software')
    .insert([{ name: 'Test', vendor: 'Vendor' }])
    .select();

  if (error) {
    console.log('❌ Insert failed:', error.message);
  } else {
    console.log('✅ Insert succeeded!', data);
  }
}

recreateTablesSimple();
