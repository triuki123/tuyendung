-- Preserve education_level (institution/free-text education) separately.
ALTER TABLE hr_cv_pool ADD COLUMN IF NOT EXISTS education_degree TEXT
  CHECK (education_degree IN ('Chưa tốt nghiệp THPT','Tốt nghiệp THPT','Chứng chỉ nghề','Trung cấp','Cao đẳng','Đại học','Sau đại học'));

-- Only explicit qualifications are synchronized. Never guess from school names.
WITH qualifications AS (
  SELECT id, CASE
    WHEN LOWER(BTRIM(education_level)) IN ('chưa tốt nghiệp thpt','chua tot nghiep thpt','below high school') THEN 'Chưa tốt nghiệp THPT'
    WHEN LOWER(BTRIM(education_level)) IN ('tốt nghiệp thpt','tot nghiep thpt','thpt','high school') THEN 'Tốt nghiệp THPT'
    WHEN LOWER(BTRIM(education_level)) IN ('chứng chỉ nghề','chung chi nghe','vocational certificate') THEN 'Chứng chỉ nghề'
    WHEN LOWER(BTRIM(education_level)) IN ('trung cấp','trung cap','intermediate') THEN 'Trung cấp'
    WHEN LOWER(BTRIM(education_level)) IN ('cao đẳng','cao dang','college','associate degree') THEN 'Cao đẳng'
    WHEN LOWER(BTRIM(education_level)) IN ('đại học','dai hoc','cử nhân','cu nhan','kỹ sư','ky su','bachelor','bachelor degree') THEN 'Đại học'
    WHEN LOWER(BTRIM(education_level)) IN ('sau đại học','sau dai hoc','thạc sĩ','thac si','tiến sĩ','tien si','postgraduate','master','doctorate','phd') THEN 'Sau đại học'
  END AS degree FROM hr_cv_pool WHERE education_degree IS NULL
)
UPDATE hr_cv_pool cv SET education_degree = q.degree FROM qualifications q
WHERE cv.id = q.id AND q.degree IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_degree ON hr_cv_pool(education_degree) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_uploaded ON hr_cv_pool(created_at DESC) WHERE deleted_at IS NULL;
