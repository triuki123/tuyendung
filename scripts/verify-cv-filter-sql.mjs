import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import dotenv from 'dotenv';
import pg from 'pg';
import { cvTestLoader } from './cv-test-loader.mjs';

// Exercise the actual service SQL in one rolled-back local DB transaction.
// No test CV, view or note is ever committed to the user's candidate pool.
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local DB only');
pg.types.setTypeParser(1082, value => value);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const database = {
  query: async (sql, params) => (await client.query(sql, params)).rows,
  queryOne: async (sql, params) => (await client.query(sql, params)).rows[0] || null,
  execute: async (sql, params) => (await client.query(sql, params)).rowCount,
  withTransaction: callback => callback(client),
};
const module = { exports: {} };
const criteriaModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/cvFilters.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: criteriaModule, exports: criteriaModule.exports, Date });
const criteria = criteriaModule.exports;
const compiled = ts.transpileModule(readFileSync('src/lib/services/hrPoolService.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(compiled, {
  module, exports: module.exports, Date, Math, Buffer,
  require: name => name === '@/lib/db' ? database : name === '@/lib/cvIndustry' ? cvTestLoader()('src/lib/cvIndustry.ts') : name === '@/lib/cvFilters' ? criteria : name === './cvExtract'
    ? { normalizeSearch: (...values) => values.filter(Boolean).join(' ').toLowerCase() } : {},
});
const service = module.exports;
const prefix = `cv_filter_${randomUUID().replaceAll('-', '')}`;
const viewerA = `${prefix}_ta_a`, viewerB = `${prefix}_ta_b`;

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '10s'");
  const { rows: [{ today }] } = await client.query('SELECT CURRENT_DATE::text AS today');
  const birthday = `${Number(today.slice(0, 4)) - 30}-01-01`;
  const first = await service.createCv({ candidateName: `${prefix} one`, uploadedBy: null, industry: prefix,
    employmentType: 'full_time', gender: 'female', dateOfBirth: birthday, jobSearchStatus: 'actively_looking',
    skills: ['SQL', 'Tuyển dụng'], yearsExperience: 5, languages: ['Tiếng Anh'], educationLevel: 'Đại học', expectedSalary: 20_000_000 });
  const second = await service.createCv({ candidateName: `${prefix} two`, uploadedBy: null, industry: prefix,
    employmentType: 'part_time', gender: 'male', jobSearchStatus: 'not_looking',
    skills: ['Excel'], yearsExperience: 1, languages: ['Tiếng Nhật'], educationLevel: 'Cao đẳng', expectedSalary: 8_000_000 });
  const unknown = await service.createCv({ candidateName: `${prefix} unknown`, uploadedBy: null });
  const ids = [first.id, second.id, unknown.id];
  async function check(filter, expected, viewer = viewerA) {
    const result = await service.searchCvs({ keyword: prefix, ...filter }, viewer);
    assert.deepEqual(result.map(item => item.id).sort(), [...expected].sort(), JSON.stringify(filter));
  }
  await check({}, ids);
  await check({ industry: prefix.toUpperCase() }, [first.id, second.id]);
  await check({ industry: '' }, [unknown.id]);
  await check({ minExperience: 3, maxExperience: 6 }, [first.id]);
  await check({ maxExperience: 2 }, [second.id]);
  await check({ employmentTypes: ['full_time'] }, [first.id]);
  await check({ gender: 'female' }, [first.id]);
  await check({ languages: ['tiếng anh'] }, [first.id]);
  await check({ minSalary: 10_000_000, maxSalary: 25_000_000 }, [first.id]);
  await check({ minAge: 20, maxAge: 40 }, [first.id]);
  await check({ educationLevels: ['đại học'] }, [first.id]);
  await check({ jobSearchStatuses: ['actively_looking'] }, [first.id]);
  await check({ skills: ['SQL', 'Tuyển dụng'] }, [first.id]);
  await check({ employmentTypes: ['full_time'], gender: 'male' }, []);
  console.log('PASS: all filter criteria execute against actual PostgreSQL; unknown details are not inferred');

  await check({ onlyUnviewed: true }, ids);
  assert.equal(await service.markCvViewed(first.id, viewerA), true);
  await check({ onlyUnviewed: true }, [second.id, unknown.id]);
  await check({ onlyUnviewed: true }, ids, viewerB);
  assert.equal((await service.getCvById(first.id, viewerA)).is_viewed, true);
  assert.equal((await service.getCvById(first.id, viewerB)).is_viewed, false);
  assert.equal(await service.markCvViewed(`${prefix}_missing`, viewerA), false);
  await assert.rejects(service.searchCvs({ onlyUnviewed: true }), /đăng nhập/);
  console.log('PASS: unread filters and view flags are isolated per TA, including detail API data');

  await client.query(`UPDATE hr_cv_pool SET created_at = NOW() - INTERVAL '61 days', updated_at = NOW() - INTERVAL '40 days',
    last_activity_at = NOW() - INTERVAL '40 days' WHERE id = ANY($1::text[])`, [ids]);
  await client.query("UPDATE hr_cv_pool SET created_at = NOW() - INTERVAL '12 hours' WHERE id = $1", [first.id]);
  await client.query("UPDATE hr_cv_pool SET created_at = NOW() - INTERVAL '5 days' WHERE id = $1", [second.id]);
  await check({ sortBy: 'updated', updatedWithinDays: 7 }, []);
  await check({ sortBy: 'uploaded', updatedWithinDays: 1 }, [first.id]);
  for (const days of [7, 30, 60]) await check({ sortBy: 'uploaded', updatedWithinDays: days }, [first.id, second.id]);
  const uploadTime = (await service.getCvById(first.id, viewerA)).uploaded_at;
  const note = await service.addNote(second.id, { body: 'Filter verification', authorId: null });
  await check({ sortBy: 'updated', updatedWithinDays: 7 }, []);
  await check({ sortBy: 'uploaded', updatedWithinDays: 7 }, [first.id, second.id]);
  assert.equal((await service.searchCvs({ keyword: prefix, sortBy: 'uploaded' }, viewerA))[0].id, first.id);
  await service.deleteNote(second.id, note.id);
  await service.updateCv(unknown.id, { employmentType: 'remote', gender: 'other', jobSearchStatus: 'open_to_offers', changedBy: viewerA });
  await check({ employmentTypes: ['remote'], gender: 'other', jobSearchStatuses: ['open_to_offers'] }, [unknown.id]);
  await check({ sortBy: 'updated', updatedWithinDays: 7 }, [unknown.id]);
  await check({ sortBy: 'uploaded', updatedWithinDays: 7 }, [first.id, second.id]);
  await service.updateCv(first.id, { educationDegree: 'Sau đại học', changedBy: viewerA });
  const updated = await service.getCvById(first.id, viewerA);
  assert.equal(new Date(updated.uploaded_at).getTime(), new Date(uploadTime).getTime());
  assert.equal(updated.education_level, 'Đại học');
  assert.equal(updated.education_degree, 'Sau đại học');
  await check({ educationLevels: ['Sau đại học'] }, [first.id]);
  await check({ educationLevels: ['Đại học'] }, []);
  console.log('PASS: actual upload time and 1/7/30/60-day filters stay unchanged after notes or edits; degree changes synchronize correctly');

  for (const [index, degree] of criteria.CV_EDUCATION_LEVELS.entries()) {
    const name = `${prefix} degree ${index}`;
    const item = await service.createCv({ candidateName: name, uploadedBy: null,
      educationLevel: 'Thông tin trường học được giữ nguyên', educationDegree: degree });
    const result = await service.searchCvs({ keyword: name, educationLevels: [degree] }, viewerA);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, item.id);
    assert.equal(result[0].education_level, 'Thông tin trường học được giữ nguyên');
  }
  assert.equal(criteria.normalizeCvEducationDegree('FPT POLYSCHOOL - FPT POLYTECH'), null);
  assert.equal(criteria.parseCvAdvancedFilter({ sortBy: 'activity' }).sortBy, 'uploaded');
  assert.throws(() => criteria.parseCvAdvancedFilter({ educationLevels: ['Tên trường không phải bằng cấp'] }), /Bằng cấp/);
  assert.deepEqual(Array.from((await service.getCvFilterOptions()).educationLevels), Array.from(criteria.CV_EDUCATION_LEVELS));
  console.log('PASS: all seven reference degree levels filter successfully; raw school data and legacy presets are preserved');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
  console.log('Test transaction rolled back; no test candidate data retained.');
}
