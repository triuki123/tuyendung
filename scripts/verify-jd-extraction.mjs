import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import mammoth from 'mammoth';
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(`src/lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`)((id) => load(id.replace('./', '')), module, module.exports);
  return cache[name] = module.exports;
}
const { extractJdFields } = load('jdExtract');
const { serializeJdFields, parseJdFields } = load('jdForm');
const sample = 'Vị trí tuyển dụng: Nhân viên kinh doanh\nĐơn vị: FADO Service\nĐịa điểm làm việc: HCM\nThời gian làm việc: 08h30 – 17h30\nMÔ TẢ CÔNG VIỆC:\nTìm khách hàng\nYÊU CẦU CÔNG VIỆC:\nKinh nghiệm 2 năm\nCHÍNH SÁCH PHÚC LỢI:\nBảo hiểm';
const result = extractJdFields(sample);
assert.equal(result.fields.duties, 'Tìm khách hàng');
assert.equal(result.fields.requirements, 'Kinh nghiệm 2 năm');
assert.equal(result.fields.benefits, 'Bảo hiểm');
assert.equal(result.fields.unit, 'FADO Service');
assert.equal(parseJdFields(serializeJdFields(result.fields)).requirements, result.fields.requirements);
assert.ok(extractJdFields('Không có thông tin').warnings.length);
assert.equal(extractJdFields('NHÂN VIÊN OPS\nMÔ TẢ CÔNG VIỆC\nĐiều phối\nĐịa chỉ: Quận 1, TP. Hồ Chí Minh').fields.title, 'NHÂN VIÊN OPS');
assert.equal(extractJdFields('NHÂN VIÊN OPS\nĐịa chỉ: Quận 1, TP. Hồ Chí Minh').fields.location, 'HCM');
assert.equal(extractJdFields('Job title: Sales Executive\nWork location: Hanoi').fields.location, 'HN');
assert.equal(extractJdFields('MÔ TẢ CÔNG VIỆC\nĐiều phối đơn hàng', 'JD - FADO - Nhân viên OPS.pdf').fields.title, 'Nhân viên OPS');
assert.equal(extractJdFields('Địa điểm làm việc: Hà Nội / Hồ Chí Minh').fields.location, '');
assert.equal(extractJdFields('Giới thiệu công ty Hà Nội\nĐịa điểm làm việc: Hồ Chí Minh').fields.location, 'HCM');
if (process.argv[2]) {
  const { value } = await mammoth.extractRawText({ path: process.argv[2] });
  const parsed = extractJdFields(value);
  assert.ok(parsed.fields.title.includes('GIÁM ĐỐC'));
  assert.equal(parsed.fields.unit, 'FADO Group');
  assert.equal(parsed.fields.location, 'HN');
  for (const key of ['work_time', 'salary', 'headcount', 'purpose', 'objectives', 'duties', 'requirements', 'benefits']) assert.ok(parsed.fields[key], key);
  console.log('PASS: supplied DOCX fields and all sections recognized');
}
console.log('PASS: JD section extraction, empty-data warnings and save/reopen round trip');
