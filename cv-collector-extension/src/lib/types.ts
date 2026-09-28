export type CandidateDraft = {
  candidate_name: string;
  candidate_email?: string;
  candidate_phone?: string;
  position_applied?: string;
  current_title?: string;
  industry?: string;
  years_experience?: string;
  education_level?: string;
  expected_salary?: string;
  location?: string;
  skills?: string;
  languages?: string;
  tags?: string;
  source: string;
  note: string;
};

export type CandidateExtraction = {
  draft: CandidateDraft;
  file: { url: string; name: string; base64?: string; type?: string };
};

export type ImportRequest = {
  type: "AF_IMPORT_CANDIDATE";
  source: "topcv" | "jobsgo" | "vieclam24h";
  targetUrl: string;
  directDetail?: boolean;
  fallback: CandidateDraft;
};
