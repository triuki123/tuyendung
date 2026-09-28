-- Migration 247: Đưa thông tin chuyển khoản ra khỏi hardcode — thành field trong template WOKA.
UPDATE email_templates SET
  schema = '[
    {"key":"khach_hang","label":"Khách hàng","type":"text","required":true},
    {"key":"so_hd","label":"Số hợp đồng","type":"text","required":true,"default":"1203/2025/HDTN/161.1CH-WK"},
    {"key":"so_vb","label":"Số văn bản","type":"text","required":true},
    {"key":"ngay_lap","label":"Ngày lập","type":"date","required":true},
    {"key":"ky_thue","label":"Kỳ thuê","type":"text","required":true,"default":"Tháng 06/2026"},
    {"key":"line_items","label":"Chi tiết chi phí","type":"rows","columns":[
      {"key":"noi_dung","label":"Nội dung","type":"text"},
      {"key":"sl","label":"SL","type":"number","default":1},
      {"key":"dvt","label":"Đvt","type":"text","default":"Tháng"},
      {"key":"don_gia","label":"Đơn giá","type":"money"},
      {"key":"thanh_tien","label":"Thành tiền","type":"money","formula":"sl * don_gia"}
    ],"defaultRows":[
      {"noi_dung":"Tiền thuê","sl":1,"dvt":"Tháng","don_gia":23000000},
      {"noi_dung":"Phí quản lý","sl":1,"dvt":"Tháng","don_gia":500000},
      {"noi_dung":"Tiền gửi xe","sl":11,"dvt":"Xe","don_gia":150000},
      {"noi_dung":"Tiền điện","sl":0,"dvt":"kWh","don_gia":4000},
      {"noi_dung":"Tiền nước","sl":0,"dvt":"m³","don_gia":25000}
    ]},
    {"key":"thanh_tien_tong","label":"Thành tiền","type":"money","formula":"SUM(line_items.thanh_tien)"},
    {"key":"vat","label":"VAT 10%","type":"money","formula":"thanh_tien_tong * 0.1"},
    {"key":"tong_cong","label":"Tổng cộng","type":"money","formula":"thanh_tien_tong + vat"},
    {"key":"bang_chu","label":"Bằng chữ","type":"textarea","required":false,"formula":"toWords(tong_cong)"},
    {"key":"han_tt","label":"Hạn thanh toán","type":"date","required":true},
    {"key":"chu_tk","label":"Chủ tài khoản","type":"text","required":true,"default":"CÔNG TY CỔ PHẦN WOKA VIỆT NAM"},
    {"key":"so_tk","label":"Số tài khoản","type":"text","required":true,"default":"1036907401"},
    {"key":"ngan_hang","label":"Ngân hàng / Chi nhánh","type":"text","required":true,"default":"Vietcombank (TMCP Ngoại Thương Việt Nam) - CN Cộng Hòa"},
    {"key":"noi_dung_ck","label":"Nội dung CK","type":"text","required":true}
  ]'::jsonb,
  body_html_tpl = replace(
    body_html_tpl,
    '<td style="padding:3px 0;width:130px;color:#6b7883;">Chủ tài khoản</td><td style="padding:3px 0;font-weight:bold;">CÔNG TY CỔ PHẦN WOKA VIỆT NAM</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Số tài khoản</td><td style="padding:3px 0;font-weight:bold;">1036907401</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Ngân hàng</td><td style="padding:3px 0;">Vietcombank (TMCP Ngoại Thương Việt Nam) - CN Cộng Hòa</td>',
    '<td style="padding:3px 0;width:130px;color:#6b7883;">Chủ tài khoản</td><td style="padding:3px 0;font-weight:bold;">{{chu_tk}}</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Số tài khoản</td><td style="padding:3px 0;font-weight:bold;">{{so_tk}}</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Ngân hàng</td><td style="padding:3px 0;">{{ngan_hang}}</td>'
  ),
  updated_at = NOW()
WHERE key = 'payment_woka';
