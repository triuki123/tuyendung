/** Fixed fictional fixtures. Never derived from real CVs or sent to an AI provider. */
export const FDV_DEMO_CVS = [{ id: 'demo-cv', candidate_name: 'Ứng viên mẫu (giả lập)', position_applied: 'Chuyên viên tuyển dụng' }];
export const FDV_DEMO_JDS = [{ id: 'demo-jd', title: 'Chuyên viên tuyển dụng · JD mẫu' }];
export function fdvDemoAnalysis(summaryOnly = false) {
  return {
    demo: true,
    summary: 'Hồ sơ giả lập: TA có 3 năm kinh nghiệm tuyển dụng Sales và Logistics, sử dụng ATS, phối hợp với hiring manager và theo dõi pipeline. Nội dung cố định để kiểm tra giao diện, không phải phân tích một ứng viên thật.',
    strengths: ['Ví dụ giả lập: quản lý pipeline và điều phối phỏng vấn.', 'Ví dụ giả lập: có kinh nghiệm tuyển dụng nhiều nhóm vị trí.'],
    gaps: ['Ví dụ giả lập: cần xác minh số lượng tuyển và tỷ lệ nhận offer.', 'Ví dụ giả lập: chưa có bằng chứng về năng lực tuyển vị trí kỹ thuật.'],
    interview_questions: ['Bạn đo hiệu quả nguồn tuyển dụng như thế nào?', 'Hãy mô tả cách xử lý một yêu cầu tuyển khó.'],
    matches: summaryOnly ? [] : [{ jd_id: 'demo-jd', title: FDV_DEMO_JDS[0].title, score: 78, skills: 85, experience: 80, responsibilities: 70, domain: 60,
      evidence: ['Bằng chứng mẫu: CV giả lập ghi sử dụng ATS; JD mẫu yêu cầu quản lý pipeline.'],
      missing: ['Chưa xác minh: KPI tuyển dụng và kinh nghiệm tuyển ngành công nghệ.'] }],
    compared: summaryOnly ? 0 : 1, totalJds: 1, truncated: false,
  };
}
export function fdvDemoAnswer(web = false) {
  return { demo: true, sources: [], text: web
    ? 'DEMO — Không thực hiện tra cứu web. Đây là câu trả lời mẫu để kiểm tra giao diện; không có dữ liệu thời sự hoặc nguồn xác minh. Khi tắt Demo và kích hoạt API, FDV sẽ tra cứu web và hiển thị nguồn.'
    : 'DEMO — Câu trả lời mẫu, không do AI tạo và không được cá nhân hoá theo câu hỏi.\n\nKhi đánh giá ứng viên, TA nên xác định yêu cầu bắt buộc của JD, đối chiếu bằng chứng trong CV, ghi nhận thông tin còn thiếu và xác minh bằng câu hỏi phỏng vấn. Không suy diễn năng lực từ thông tin cá nhân.\n\nBạn có thể chuyển sang Phân tích CV để xem báo cáo mẫu.' };
}
