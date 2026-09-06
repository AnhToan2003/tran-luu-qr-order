# BÁO CÁO AUDIT VÀ KIỂM TRA MONGODB (DATABASE-CHECK)

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Ngày thực hiện:** 06/09/2026  
**Người thực hiện:** Antigravity  
**Trạng thái:** ĐÃ KẾT NỐI VÀ KIỂM ĐỊNH THỰC TẾ TRÊN MÁY CHỦ LOCALHOST  

---

## 1. Kết quả kiểm tra kết nối (Ping & Topology)

- **Chuỗi kết nối kiểm tra:** `mongodb://localhost:27017`
- **Tình trạng cổng kết nối:** Cổng `27017` đang **MỞ** (Listening).
- **Phiên bản MongoDB:** **8.2.1** (Chạy dưới dạng Windows Service `MongoDB Server`).
- **Topology thực tế:** **Standalone Deployment** (`setName: undefined`).
  - Instance là một máy chủ đơn lẻ, hiện chưa cấu hình Replica Set cục bộ.

## 2. Kiểm tra tính tách biệt dữ liệu (Database Isolation Audit)

Hệ thống đã quét toàn bộ danh sách các cơ sở dữ liệu hiện có trên máy chủ MongoDB `localhost:27017`:
1. `bat_dong_san` (Trùng khớp với cơ sở dữ liệu trên hình ảnh MongoDB Compass của Chủ sân).
2. `Hair_Salone`
3. `cellphone-shop` / `cellphone_shop` / `cellphoneshop`
4. `movie_web`
5. `portfolio`
6. Các database hệ thống: `admin`, `config`, `local`.

### Cam kết bảo vệ an toàn dữ liệu:
- **Tên cơ sở dữ liệu chuyên biệt của dự án:** **`tran_luu_order`**
- **Quy tắc bất biến:**
  - Hệ thống chỉ kết nối và thực hiện thao tác Đọc / Ghi / Tạo bảng duy nhất trong phạm vi database **`tran_luu_order`**.
  - Tuyệt đối không can thiệp, không đọc, không ghi, không sửa đổi hoặc làm ảnh hưởng đến cơ sở dữ liệu `bat_dong_san` cũng như bất kỳ database nào khác trên máy chủ.
  - Mỗi khi kết nối, chuỗi connection string luôn chỉ định rõ ràng database mục tiêu: `mongodb://localhost:27017/tran_luu_order`.

## 3. Đánh giá kỹ thuật về Giao dịch (Transactions & Atomicity)

Theo tài liệu chính thức từ MongoDB:
> *"Multi-document transactions are available for replica sets and sharded clusters. Transactions are not available for standalone deployments."*

### Phân tích và Giải pháp triển khai:
1. **Môi trường Cloud Production (MongoDB Atlas M0 Free)**:
   - Gói MongoDB Atlas M0 miễn phí mặc định được triển khai dưới dạng **3-node Replica Set**.
   - Hỗ trợ 100% giao dịch đa document (`session.withTransaction`) chuẩn ACID, bảo toàn tính nguyên tử cho mọi đơn hàng và biến động kho.
2. **Môi trường Cục bộ (Local Standalone 8.2.1)**:
   - Trên Standalone instance hiện tại, các lệnh cập nhật đơn document mang tính nguyên tử tuyệt đối (Atomic Single-Document Update) thông qua toán tử `$inc` và bộ lọc điều kiện (ví dụ: `stock: { $gte: quantity }`).
   - Để bảo vệ tính nguyên tử của toàn bộ giỏ hàng nhiều món:
     - Áp dụng kỹ thuật **Kiểm tra & Khóa tồn kho có điều kiện**: Trừ kho từng món có kiểm tra `stock >= quantity`.
     - **Compensating Rollback (Cơ chế hoàn trả bù trừ)**: Nếu một món trong giỏ hàng bị thiếu hàng giữa chừng, hệ thống tự động chạy vòng lặp bù trừ cộng lại tồn kho cho các món đã trừ trước đó, đồng thời hủy bỏ việc tạo đơn hàng.
   - Khi chuyển sang MongoDB Atlas trên Production, tầng Service tự động bật `session.withTransaction()` mà không cần viết lại logic nghiệp vụ.

**Kết luận:** Cơ sở dữ liệu `localhost:27017` hoàn toàn sẵn sàng, an toàn để xây dựng cơ sở dữ liệu `tran_luu_order`.
