# KẾ HOẠCH TRIỂN KHAI — HỆ THỐNG GỌI NƯỚC QR TRẦN LỰU

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Quy mô:** 1 cơ sở, 16 sân (Sân 01 đến Sân 16)  
**Tác giả:** Antigravity  
**Ngày cập nhật:** 06/09/2026  

---

## 1. Lộ trình triển khai tổng thể

| Giai đoạn | Nội dung | Đầu ra bắt buộc | Trạng thái |
|---|---|---|---|
| **Giai đoạn 0** | Khảo sát, khóa phương án, thẩm định No-Card, ADR, Decisions | `PLAN.md`, `ADR-001`, `ADR-002`, `ASSUMPTIONS.md`, `DECISIONS.md` | **Hoàn thành** |
| **Giai đoạn 1** | Thiết kế Prototype có tương tác, kiểm thử Viewport (360, 390, 1440), Design Gate | `docs/DESIGN.md`, Ứng dụng Prototype, Screenshots thực tế | **Hoàn thành** |
| **Giai đoạn 2** | Database & Giao dịch nguyên tử (MongoDB Replica Set, ACID Transactions, Seed) | MongoDB Schema, Acceptance Tests (`backend.test.ts`) | **Hoàn thành** |
| **Giai đoạn 3** | Hoàn thiện luồng Khách hàng (Catalog, Giỏ hàng, Ly đá, Đặt, Sửa/Hủy 60s) | PWA Mobile-First, Session Isolation, HMAC QR | **Hoàn thành** |
| **Giai đoạn 4** | Quầy quản trị (Nhóm sân, WebSocket Real-time, Chuông báo, CRUD Nước/Kho/Sân/QR) | Quầy vận hành, Chuông báo âm thanh thật, Xuất QR PNG/PDF | **Hoàn thành** |
| **Giai đoạn 5** | Báo cáo doanh thu & Lịch sử đơn & Nhập hàng & Xuất Excel | Biến động kho, Giá vốn bình quân, File Excel chuẩn kế toán | **Hoàn thành** |
| **Giai đoạn 6** | QA ma trận & Stress test 100 người dùng đồng thời | `tests/concurrency-100.test.ts`, 30/30 tests PASS (100%) | **Hoàn thành** |
| **Giai đoạn 7** | Sao lưu & Dọn dẹp dữ liệu (Mốc 1 tháng chuẩn, Custom Date, Best Solution) | Backup JSON toàn hệ thống, Bảo toàn kho 100% | **Hoàn thành** |

---

## 2. Nguyên tắc bất biến không thỏa hiệp

1. **Khách vãng lai**: Không tài khoản, không login, không lấy số điện thoại. Định danh qua phiên cookie HttpOnly bảo mật.
2. **Ly đá miễn phí**: 0 đến tối đa 1 ly/chai. Không tính tiền, không trừ tồn kho đá. Tự động kẹp giảm ly đá khi giảm số chai.
3. **Cửa sổ 60 giây**: Khách chỉ sửa/hủy đơn của mình khi `now < editable_until`. Quầy chỉ nhận đơn sau 60 giây (`now >= editable_until`).
4. **Không nhân viên hủy**: Quản lý không có quyền hủy đơn; Đã giao đồng nghĩa đã thu tiền.
5. **Kho nguyên tử**: Trừ khi đặt, điều chỉnh khi sửa, hoàn khi hủy, giao không trừ lại. Khóa theo thứ tự ID ổn định.
6. **Nhóm theo sân**: Quầy phân nhóm trực quan theo từng sân (Sân 01 - Sân 16), không gộp hóa đơn cả buổi thành một.
7. **Bảo tồn lịch sử**: Tên và giá chốt snapshot tại thời điểm đặt; xóa sản phẩm/sân là xóa mềm (soft-delete).
8. **Chuông báo quầy**: Chuông kêu lặp mỗi 5s khi có đơn cần nhận (>= 60s), có nút Bật/Thử chuông thân thiện chính sách autoplay.
9. **Hạ tầng No-Card**: Khởi đầu hoàn toàn miễn phí, không yêu cầu thẻ ngân hàng (Node.js Express + MongoDB Replica Set / Atlas M0 Free).
10. **Không đè hệ thống cũ**: Không làm hỏng QR cũ, không can thiệp database cũ khi chưa có kế hoạch chuyển đổi.
