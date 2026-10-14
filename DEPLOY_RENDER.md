# Deploy miễn phí trên Render (bản thử nghiệm)

Ứng dụng này là một dịch vụ full-stack: Express phục vụ giao diện Vite và API, còn WebSocket chạy trên cùng HTTP server. Blueprint ở `render.yaml` giữ nguyên mô hình này trên một Render Web Service.

## Giới hạn cần biết

- Gói Free ngủ sau 15 phút không có traffic và có thể mất khoảng một phút để thức dậy. Không phù hợp cho quầy bán hàng cần hoạt động ổn định cả ngày.
- Filesystem của web service là tạm thời. Không lưu backup, ảnh upload hay dữ liệu cần giữ lâu dài trên máy chủ này.
- MongoDB Atlas Free là replica set để đáp ứng transaction. Redis phải là dịch vụ ngoài có xác thực và TLS; không dùng Render Key Value Free cho session/rate limit production vì dữ liệu có thể mất khi Redis khởi động lại.
- Blueprint này không tự copy dữ liệu từ Railway. Giữ Railway chạy cho tới khi đã chuyển dữ liệu và kiểm tra app mới.

## Chuẩn bị dịch vụ

1. Tạo MongoDB Atlas cluster ở region gần Singapore, tạo database user riêng, và cho phép kết nối từ Render. Dùng `mongodb+srv://...` với database `tran_luu_qr_order`.
2. Tạo Redis TLS có xác thực (ví dụ Upstash Redis) và lấy URL dạng `rediss://...`.
3. Trong Render, tạo Blueprint từ repo này và chọn `render.yaml`. Chọn gói Free để thử nghiệm.
4. Khi Render yêu cầu các biến `sync: false`, nhập:
   - `PUBLIC_ORIGIN`: URL HTTPS thật của Render service, hoặc domain riêng nếu đã cấu hình.
   - `MONGO_URI`: URI MongoDB Atlas trỏ database `tran_luu_qr_order`.
   - `REDIS_URL`: URL Redis TLS có xác thực.
   - `ADMIN_PASSWORD_HASH`: hash scrypt theo định dạng `32-hex-salt:128-hex-hash`. Nếu muốn đặt mật khẩu admin mới, chạy `npm run generate:secrets:staging` ở checkout local chưa có `.env.staging`; lấy hash từ file `.env.staging` bị Git ignore, cất mật khẩu được in ra ở nơi an toàn, rồi chỉ nhập hash vào Render.
5. Render tự tạo `QR_SIGN_SECRET`, `COOKIE_SECRET`, `INTERNAL_HEALTH_TOKEN`; không chép các giá trị này vào Git.

## Chuyển dữ liệu từ Railway

Không chạy seed data trên production. Trước khi đổi DNS hoặc cho người dùng vào app mới:

1. Tạo bản dump MongoDB từ Railway bằng thông tin kết nối Railway hiện tại và lưu ngoài repo ở nơi an toàn.
2. Tạm dừng ghi đơn trên app cũ, tạo bản dump cuối cùng, rồi restore vào Atlas. Không xóa hoặc tắt database Railway.
3. Kiểm tra số lượng dữ liệu chính (orders, products, users, settings) trên Atlas và chạy health check của Render.
4. Đăng nhập admin, thử tạo đơn thử và xác minh WebSocket cập nhật realtime.
5. Chỉ chuyển domain sau khi kiểm tra thành công; giữ nguyên dịch vụ/database Railway để có thể quay lui.

## Khi dùng thật

Nâng web service lên gói không ngủ và cấu hình backup off-site có thể khôi phục. Render Free chỉ phù hợp preview/hobby; app POS đặt tại quầy không nên phụ thuộc vào cold start, Redis không bền vững hoặc backup nằm trên filesystem tạm.
