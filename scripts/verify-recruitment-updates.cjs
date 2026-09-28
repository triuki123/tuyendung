const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/lib/notifications/recruitmentUpdates.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const calls = [];
const moduleBox = { exports: {} };
vm.runInNewContext(js, {
  exports: moduleBox.exports, module: moduleBox, console, Date,
  require: id => id.includes('engine') ? { notify: async (...args) => calls.push(args) }
    : { getHrNotifyUserIds: async () => ['configured-recipient'] },
});
const wrap = moduleBox.exports.withRecruitmentUpdate;
(async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = Response.json({ success: true, data: { id: 'record', status: 'open', email: 'private@example.com', description: 'private CV' } });
    const result = await wrap(async () => response, 'Kho JD', '/nguon-nhan-luc/kho-mo-ta-cong-viec')({ method }, { params: { id: 'record' } });
    assert.equal(result, response);
  }
  assert.equal(calls.length, 4);
  assert.ok(!JSON.stringify(calls).includes('private'));
  await wrap(async () => Response.json({ error: 'conflict' }, { status: 409 }), 'Lịch', '/calendar')({ method: 'POST' });
  await wrap(async () => Response.json({ success: false }), 'Lịch', '/calendar')({ method: 'POST' });
  assert.equal(calls.length, 4);
  console.log('PASS: successful mutations notify; errors do not; private document content excluded.');
})().catch(error => { console.error(error); process.exitCode = 1; });
