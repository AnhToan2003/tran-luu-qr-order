# ADR-001: KIẾN TRÚC HỆ THỐNG GỌI NƯỚC QR TRẦN LỰU

**Trạng thái:** Được chấp thuận (Accepted)  
**Ngày:** 06/09/2026  
**Tác giả:** Antigravity  

---

## 1. Bối cảnh & Vấn đề

Hệ thống đặt nước phục vụ người chơi tại 16 sân cầu lông Trần Lựu. Yêu cầu:
- Khách quét QR truy cập tức thời từ điện thoại di động, không cần đăng nhập.
- Thao tác nhanh bằng một tay giữa hiệp đấu.
- Quầy quản lý nhận đơn tức thời, có chuông báo âm thanh khi qua mốc 60 giây.
- Giao dịch kho và đặt hàng phải đảm bảo tính nguyên tử (atomic transaction) trong môi trường nhiều khách đặt cùng lúc.
- Chi phí hạ tầng ban đầu $0, không đòi hỏi cung cấp thẻ tín dụng, dễ dàng bàn giao tài khoản cho chủ sân.

## 2. Quyết định kiến trúc (Architecture Decision)

Hệ thống áp dụng mô hình kiến trúc:
```text
Khách tại sân / Nhân viên quầy
         │  (HTTPS cùng Origin)
         ▼
Cloudflare Workers (Edge Network)
  ├── Static Assets: Single Page App (Vite + React + TypeScript)
  └── /api/* : API Backend gọn nhẹ viết bằng Hono framework
         │  (HTTPS / Supabase Client)
         ▼
Supabase (Managed PostgreSQL)
  ├── PostgreSQL Engine: Dữ liệu quan hệ, Constraints, Indexes
  ├── Database Functions (RPC): Giao dịch kho và đơn hàng nguyên tử (ACID)
  ├── Supabase Storage: Lưu trữ ảnh sản phẩm tải lên (1 GB Free)
  └── Supabase Auth: Xác thực duy nhất cho tài khoản Quầy quản trị
```

### 2.1 Thành phần chi tiết:
1. **Frontend**:
   - React + TypeScript + Vite.
   - Styling: CSS Modules / Custom CSS Variables chuẩn Design Tokens, không dùng Tailwind CSS mặc định nhằm đảm bảo kiểm soát visual tối đa và bundle gọn nhẹ.
   - Quản lý phiên khách: Khách nhận một Cookie phiên ngẫu nhiên độ an toàn cao (`HttpOnly`, `SameSite=Lax`, `Secure`), lưu hash phiên ở server. Không tạo tài khoản Auth nặc danh (tránh chạm rate limit IP của Supabase Auth).
2. **Backend API**:
   - Triển khai trên Cloudflare Workers sử dụng **Hono** framework.
   - Hono cung cấp routing siêu nhanh, chuẩn Web Standards, kiểm tra CSRF (Origin header), xác thực cookie phiên khách và JWT của Admin.
3. **Database & Giao dịch**:
   - Sử dụng PostgreSQL hosted trên Supabase.
   - Mọi thao tác Đặt đơn, Sửa đơn, Hủy đơn, Chuyển trạng thái giao hàng được đóng gói thành các **PostgreSQL Stored Procedures (RPC Functions)** chạy trong một transaction duy nhất (`BEGIN ... COMMIT`).
   - Khóa sản phẩm theo thứ tự ID ổn định (`SELECT ... FOR UPDATE ORDER BY id ASC`) để loại trừ nguy cơ deadlock khi nhiều người đặt đồng thời.
4. **Cơ chế cập nhật trạng thái**:
   - Quầy quản trị: Polling nhẹ nhàng 3–5 giây/lần tới endpoint `/api/admin/orders/active` (chỉ lấy đơn đang mở, không quét toàn bộ lịch sử).
   - Khách hàng: Polling 5–8 giây/lần khi đang có đơn mở (`editable_until` hoặc chưa `delivered`). Tự động dừng polling khi tab ở chế độ nền (visibilitychange).
5. **Cơ chế Chuông báo quầy**:
   - Web Audio API tổng hợp âm thanh chuông ngân tự nhiên (dual tone chiming) hoặc phát tệp âm thanh chuẩn, kích hoạt bằng thao tác chạm "Bật âm báo" của nhân viên để tuân thủ chính sách Autoplay của trình duyệt.
   - Chuông lặp mỗi 5 giây chừng nào tập đơn `new` có `now >= editable_until` khác rỗng.

## 3. Hệ quả (Consequences)

- **Ưu điểm**:
  - Không tốn chi phí máy chủ hàng tháng ($0/tháng).
  - Không cần duy trì WebSocket server, Redis hay Kafka phức tạp.
  - Tính toàn vẹn dữ liệu được đảm bảo tuyệt đối ở tầng cơ sở dữ liệu PostgreSQL.
  - Trải nghiệm tải trang ban đầu cực nhanh nhờ mạng CDN toàn cầu của Cloudflare.
- **Hạn chế & Giải pháp**:
  - Cơ sở dữ liệu Supabase Free tier sẽ tạm dừng nếu không có truy vấn trong 7 ngày. Giải pháp: Có nút Unpause trực quan trên Dashboard Supabase, ghi rõ trong tài liệu bàn giao.
  - Giới hạn 100.000 requests/ngày của Cloudflare Workers: Dư dả gấp hàng chục lần so với nhu cầu thực tế của 16 sân cầu lông (khoảng 300 - 1.000 lượt quét/ngày).
