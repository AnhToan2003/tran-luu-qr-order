# NHẬT KÝ QUYẾT ĐỊNH KỸ THUẬT (DECISIONS LOG)

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  

---

| Mã quyết định | Ngày | Nội dung quyết định | Lý do & Căn cứ |
|---|---|---|---|
| **DEC-01** | 06/09/2026 | Sử dụng Vite + React + TypeScript cho frontend | Khởi động nhanh, bundle nhỏ gọn, tương thích hoàn hảo với Cloudflare Workers Static Assets. |
| **DEC-02** | 06/09/2026 | Sử dụng CSS Modules / CSS Variables thay vì Tailwind CSS | Tối ưu kiểm soát bố cục vi mô, tránh phụ thuộc utility phình to, tuân thủ đúng yêu cầu giao diện có bản sắc riêng. |
| **DEC-03** | 06/09/2026 | Quản lý phiên khách hàng qua HttpOnly Secure Cookie (CSPRNG hash) | Tránh tạo anonymous account trong Supabase Auth làm cạn kiệt IP rate limit khi nhiều khách dùng chung Wi-Fi tại sân. |
| **DEC-04** | 06/09/2026 | Dùng Supabase Storage thay vì Cloudflare R2 | Cloudflare R2 bắt buộc nhập thẻ thanh toán quốc tế dù có free tier, trong khi Supabase Storage (1 GB) hoàn toàn No-Card. |
| **DEC-05** | 06/09/2026 | Xử lý giao dịch kho & đơn hàng bằng PostgreSQL Stored Functions (RPC) | Đảm bảo tính ACID nguyên tử tuyệt đối, loại bỏ race condition khi 2 khách tranh mua chai cuối cùng. |
| **DEC-06** | 06/09/2026 | Quản lý âm thanh chuông bằng Web Audio API | Tạo âm thanh chuông ngân tự nhiên, không phụ thuộc vào tải tệp mp3 ngoài qua mạng, dễ dàng tùy biến tần số âm báo. |
| **DEC-07** | 06/09/2026 | Phân nhóm đơn theo Sân trên giao diện Quầy (BR-06) | Giúp nhân viên nhận diện ngay lập tức số nước/đá cần gom cho một sân cụ thể, nhưng không tự động gộp hóa đơn cả buổi. |
