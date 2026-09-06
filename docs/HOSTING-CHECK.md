# BÁO CÁO XÁC MINH HẠ TẦNG MIỄN PHÍ KHÔNG CẦN THẺ (HOSTING-CHECK) — CẬP NHẬT MONGODB

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Ngày cập nhật:** 06/09/2026  
**Chủ sân:** AnhToan2003  
**Người thực hiện:** Antigravity  
**Kết luận:** ĐẠT YÊU CẦU NO-CARD (Sử dụng MongoDB Localhost cho Development và MongoDB Atlas M0 Free cho Production).

---

## 1. Dịch vụ Database: MongoDB

### 1.1 Môi trường Phát triển Cục bộ (Local Development)
- **Địa chỉ kết nối:** `mongodb://localhost:27017/tran_luu_order`
- **Tài nguyên:** Hoàn toàn miễn phí, chạy trên phần cứng máy chủ cục bộ của Chủ sân.
- **Tách biệt dữ liệu:** Độc lập tuyệt đối với cơ sở dữ liệu `bat_dong_san` và các database khác đang cùng nằm trên máy chủ.
- **Topology:** Standalone MongoDB v8.2.1.

### 1.2 Môi trường Đám mây Chính thức (Production Cloud — MongoDB Atlas M0)
- **Nguồn chính thức:** [MongoDB Atlas Pricing & Free Tier](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- **Yêu cầu thẻ ngân hàng:** **KHÔNG**. Đăng ký tài khoản Atlas và tạo M0 Free Cluster hoàn toàn không cần nhập thẻ.
- **Hạn mức tài nguyên Free Tier (M0 Cluster):**
  - Dung lượng lưu trữ: **512 MB** storage.
  - Cấu trúc: Tự động chạy **3-node Replica Set** (hỗ trợ hoàn hảo native multi-document transactions chuẩn ACID).
  - Băng thông mạng: 10 GB tải vào / 10 GB tải ra mỗi tháng.
  - Kết nối đồng thời: Tối đa 500 kết nối.
  - Số lượng database / collections: Không giới hạn trong phạm vi 512 MB.
- **Chính sách tạm dừng:** Không tự động pause như Supabase nếu có traffic duy trì, chỉ cần đăng nhập định kỳ nếu dự án hoàn toàn không có hoạt động trong nhiều tháng.
- **Hành vi khi chạm ngưỡng:** Cụm M0 chuyển sang chế độ từ chối ghi mới khi vượt quá 512 MB, **tuyệt đối không tự động nâng cấp tính phí**.

## 2. Dịch vụ Node.js Backend & Static Frontend

- **Tùy chọn 1: Render / Fly.io / Vercel (Free No-Card)**:
  - Render cung cấp Web Service Node.js miễn phí không cần thẻ.
  - Vercel hỗ trợ Serverless Functions Node.js + Frontend Static Assets hoàn toàn miễn phí không cần thẻ.
- **Tùy chọn 2: Chạy trực tiếp trên máy chủ quầy thu ngân**:
  - Vì Sân Cầu Lông Trần Lựu có máy tính đặt tại quầy thu ngân (đang chạy MongoDB `localhost:27017`), hệ thống có thể chạy song song bản Node.js Server cục bộ qua mạng LAN hoặc Cloudflare Tunnel (miễn phí không cần mở port) để khách tại sân truy cập.

## 3. Đánh giá tính khả thi với quy mô 16 Sân Cầu Lông

- 512 MB MongoDB Atlas đủ lưu trữ hơn **200.000 đơn hàng** chi tiết (trung bình 1 đơn chiếm ~1.5 KB JSON BSON). Với tần suất 100 - 300 đơn/ngày, 512 MB đủ lưu trữ liên tục hơn 2 - 3 năm mà không cần xóa dữ liệu.
- Tài khoản và quyền truy cập thuộc quyền sở hữu của Chủ sân (AnhToan2003).

**Kết luận:** Kiến trúc MongoDB hoàn toàn khả thi, đáp ứng trọn vẹn tiêu chuẩn No-Card.
