const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(path, extras = {}) {
  const box = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports: box.exports, module: box, console, Date, ...extras });
  return box.exports;
}
const core = load('src/lib/fdv.ts');
assert.equal(core.fdvScore({ skills: 100, experience: 50, responsibilities: 50, domain: 0 }), 65);
assert.throws(() => core.fdvScore({ skills: 101 }));
assert.throws(() => core.fdvScore({ skills: '100' }));
assert.ok(!core.redactCv('Test user@example.com 0933569799').includes('user@example.com'));
let payload;
const service = load('src/lib/services/fdvService.ts', {
  require: () => ({}), process: { env: { OPENAI_API_KEY: 'test-placeholder' } }, AbortSignal,
  fetch: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Đã kiểm tra', annotations: [{ type: 'url_citation', title: 'Nguồn', url: 'https://example.com' }] }] }] }) };
  },
});
(async () => {
  await service.callFdv('cv redacted', 'TA instruction', core.FDV_ANALYSIS_SCHEMA);
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.tools, undefined);
  const result = await service.callFdv('public industry question', 'TA instruction', undefined, true);
  assert.equal(payload.tools[0].type, 'web_search');
  assert.equal(payload.tool_choice, 'required');
  assert.equal(result.sources[0].url, 'https://example.com');
  const noKey = load('src/lib/services/fdvService.ts', { require: () => ({}), process: { env: {} } });
  await assert.rejects(noKey.callFdv('question', ''), /OPENAI_API_KEY/);
  console.log('PASS FDV score, redaction, structured output request, web citations, missing-key handling (mock API, no charges).');
})().catch(error => { console.error(error); process.exitCode = 1; });
