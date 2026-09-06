# KẾ HOẠCH NÂNG CẤP & CHUYỂN ĐỔI KIẾN TRÚC MONGODB (FIX-PLAN)

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Ngày lập:** 06/09/2026  
**Chủ sân:** AnhToan2003  
**Đơn vị thực hiện:** Antigravity  

---

## 1. Mục tiêu điều chỉnh kiến trúc

Thay thế phương án cơ sở dữ liệu Supabase PostgreSQL bằng **MongoDB** theo yêu cầu trực tiếp từ Chủ sân. Kết nối trực tiếp vào máy chủ MongoDB cục bộ đang chạy tại `localhost:27017` để phát triển, chuẩn bị sẵn sàng cho việc kết nối MongoDB Atlas M0 khi triển khai production.

Bảo vệ tuyệt đối cơ sở dữ liệu `bat_dong_san` và các database khác đang cùng nằm trên instance này. Toàn bộ dữ liệu của hệ thống nằm độc lập trong database: **`tran_luu_order`**.

---

## 2. Lộ trình thực hiện chi tiết (Bước A -> Bước G)

### Bước A — Audit và xác minh kết nối (HOÀN TẤT)
- [x] Ping cổng `27017` tại `localhost`, xác nhận phiên bản MongoDB `8.2.1`.
- [x] Kiểm tra topology (hiện là Standalone).
- [x] Rà soát danh sách database, xác nhận sự tồn tại của `bat_dong_san` và các db khác.
- [x] Lập `docs/DATABASE-CHECK.md` ghi nhận kết quả và cam kết tách biệt.
- [x] Lập `docs/FIX-PLAN.md`.
- [x] Cập nhật `docs/ADR-002-mongodb-architecture.md` thay thế cho `ADR-001`.
- [x] Cập nhật `docs/HOSTING-CHECK.md` bổ sung MongoDB Atlas M0.

### Bước B — Hoàn thiện nền thiết kế và giao diện thực tế
- [x] Đã xây dựng hoàn chỉnh Prototype có tương tác (Giai đoạn 1) với Design Tokens Xanh lá/Trắng.
- [x] Kiểm thử hiển thị không tràn chữ/vùng chạm tại các độ phân giải 360px, 390px, 768px, 1440px.
- [ ] Chuẩn bị các API hooks trên frontend để sẵn sàng nhận dữ liệu thời gian thực từ backend MongoDB thay thế cho mock tĩnh.

### Bước C — Xây dựng Database, Auth, API và Giao dịch kho trên MongoDB
- [ ] Khởi tạo thư mục `server/` với Node.js + Express/Hono backend.
- [ ] Thiết lập file kết nối `server/db.ts` trỏ vào `mongodb://localhost:27017/tran_luu_order`.
- [ ] Tự động khởi tạo Collections và Indexes:
  - `courts`: Index `code` unique, `is_active`.
  - `products`: Index `is_available`, `stock`.
  - `orders`: Index `customer_session_hash`, `client_request_id` (unique), `status`, `created_at`, `editable_until`.
  - `order_items`: Index `order_id`.
  - `inventory_movements`: Index `product_id`, `operation_id` (unique).
  - `app_settings`: Index `key` unique.
- [ ] Seed có chủ ý 16 sân đấu (`Sân 01` đến `Sân 16`) và 6 món nước giải khát thực tế vào `tran_luu_order`. Tuyệt đối không seed runtime mỗi lần server khởi động lại.
- [ ] Viết các service xử lý giao dịch kho:
  - Đặt đơn: Trừ kho từng món có điều kiện `stock >= quantity`, lưu đơn, tạo mốc `editable_until = now + 60s`.
  - Sửa đơn: Trong 60s, bù trừ chênh lệch kho an toàn, giữ nguyên mốc 60s.
  - Hủy đơn: Trong 60s, hoàn lại 100% kho, chuyển trạng thái `cancelled`.
  - Chuyển trạng thái quầy: Chặn nhận đơn trước 60s, chuyển bước tuần tự (`new` -> `accepted` -> `preparing` -> `delivered`).

### Bước D — Nối toàn bộ giao diện người dùng vào API thật
- [ ] Thay thế dữ liệu mock trong `src/App.tsx` bằng các lệnh gọi API thật:
  - Màn hình khách lấy menu từ `GET /api/catalog?court_code=05`.
  - Giỏ hàng gửi đơn qua `POST /api/orders`.
  - Màn hình đếm ngược gọi `PATCH /api/orders/:id` và `POST /api/orders/:id/cancel`.
  - Màn hình quầy polling `GET /api/admin/orders/active` mỗi 3-5s.
  - Chuông quầy kích hoạt dựa trên tập đơn thật qua 60s.
- [ ] Xử lý đầy đủ các trạng thái Loading, Error, Empty và Offline.
- [ ] Loại bỏ công cụ debug/mock switch khỏi phiên bản phân phối.

### Bước E — Nghiệm thu QA thực tế (T01 – T40)
- [ ] Chạy kiểm thử tự động với 2 phiên trình duyệt độc lập.
- [ ] Kiểm thử tranh chấp mua chai nước cuối cùng (`stock = 1`).
- [ ] Kiểm thử sửa đơn giây 55 và hủy đơn trước 60s.
- [ ] Kiểm thử đơn qua 60s tự chuyển cột và quầy bấm nhận.
- [ ] Kiểm tra báo cáo doanh thu và xuất file Excel đối chiếu số liệu thật.

### Bước F & G — Triển khai Production & Bàn giao
- [ ] Cấu hình MongoDB Atlas M0 Replica Set cho môi trường Production (khi Chủ sân cung cấp URI).
- [ ] Triển khai frontend/backend an toàn, biến môi trường tách biệt khỏi Git.
- [ ] Bàn giao tài liệu vận hành và hướng dẫn sao lưu `mongodump`.
