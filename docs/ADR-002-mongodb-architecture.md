# ADR-002: CHUYỂN ĐỔI SANG KIẾN TRÚC MONGODB

**Trạng thái:** Được chấp thuận (Accepted) — Thay thế ADR-001  
**Ngày:** 06/09/2026  
**Chủ sân:** AnhToan2003  
**Đơn vị thực hiện:** Antigravity  

---

## 1. Bối cảnh & Lý do thay đổi

Trong thiết kế ban đầu (ADR-001), hệ thống dự kiến sử dụng Supabase PostgreSQL kết hợp Cloudflare Workers. Tuy nhiên, theo yêu cầu mới từ Chủ sân và thực tế môi trường triển khai:
- Chủ sân sở hữu máy chủ MongoDB sẵn có trên máy cục bộ (`localhost:27017`) và ưu tiên sử dụng MongoDB cho hệ sinh thái của mình.
- Cần một kiến trúc nhất quán từ môi trường phát triển cục bộ đến môi trường đám mây (MongoDB Atlas M0).
- Cần bảo đảm an toàn dữ liệu tuyệt đối cho các cơ sở dữ liệu khác đang cùng nằm trên máy chủ MongoDB (như `bat_dong_san`).

## 2. Quyết định kiến trúc mới (ADR-002)

Hệ thống chuyển đổi toàn diện sang kiến trúc **Node.js + MongoDB**:
```text
Trình duyệt Khách (Mobile) / Quầy (Desktop)
         │  (HTTPS / RESTful API)
         ▼
Node.js Backend Server (Express / Hono)
  ├── Quản lý phiên khách qua Cookie HttpOnly an toàn
  ├── API Routes: /api/catalog, /api/orders, /api/admin/...
  ├── Service Layer: Kiểm soát giao dịch kho & cửa sổ 60s
  └── Tự động nhận diện Topology (Standalone vs Replica Set)
         │  (MongoDB Driver)
         ▼
MongoDB Engine
  ├── Môi trường Dev Local: mongodb://localhost:27017/tran_luu_order
  │   └── Standalone: Atomic $inc + Compensating Rollback
  └── Môi trường Production: MongoDB Atlas M0 Cluster
      └── 3-Node Replica Set: Native Multi-Document ACID Transactions
```

### 2.1 Các nguyên tắc then chốt:
1. **Tách biệt Database hoàn toàn**:
   - Chỉ sử dụng duy nhất database `tran_luu_order`.
   - Tuyệt đối không can thiệp vào `bat_dong_san` hay bất kỳ database nào khác trên `localhost:27017`.
2. **Cơ chế đảm bảo tính nguyên tử của kho**:
   - Trừ kho sản phẩm bằng toán tử nguyên tử cấp document:
     ```javascript
     collection.updateOne(
       { _id: productId, stock: { $gte: quantity } },
       { $inc: { stock: -quantity } }
     );
     ```
   - Nếu bất kỳ món nào trong giỏ hàng không đủ tồn kho, hệ thống tự động hoàn trả (compensate) các món đã trừ trước đó và hủy đơn, bảo đảm không bao giờ bị âm kho.
   - Khi chạy trên Replica Set (MongoDB Atlas), hệ thống tự động bọc trong `session.withTransaction()`.
3. **Bảo tồn dữ liệu lịch sử**:
   - Dữ liệu đơn hàng (`orders`) lưu trữ snapshot trực tiếp tên món, giá bán, tên sân tại thời điểm đặt. Dù sản phẩm có thay đổi giá hoặc bị xóa mềm trong danh mục, lịch sử đơn hàng và doanh thu vẫn bất biến.

## 3. Hệ quả

- **Ưu điểm**:
  - Tương thích 100% với hạ tầng MongoDB hiện có của Chủ sân.
  - Cấu trúc tài liệu linh hoạt (document model), dễ dàng lưu trữ chi tiết dòng đơn và ly đá lồng nhau mà không cần join nhiều bảng phức tạp.
  - Hiệu năng đọc catalog và polling đơn hàng cực nhanh nhờ chỉ mục tối ưu.
- **Hạn chế & Giải pháp**:
  - Local MongoDB hiện là Standalone nên không hỗ trợ native multi-document transaction -> Giải quyết bằng atomic conditional update + compensating rollback, và tự động nâng cấp lên full transaction khi deploy lên MongoDB Atlas Replica Set.
