# KẾ HOẠCH TRIỂN KHAI — HỆ THỐNG GỌI NƯỚC QR TRẦN LỰU

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Quy mô:** 1 cơ sở, 16 sân (Sân 01 đến Sân 16)  
**Tác giả:** Antigravity  
**Ngày cập nhật:** 06/09/2026  

---

## 1. Lộ trình triển khai tổng thể

| Giai đoạn | Nội dung | Đầu ra bắt buộc | Trạng thái |
|---|---|---|---|
| **Giai đoạn 0** | Khảo sát, khóa phương án, thẩm định No-Card, ADR, Decisions | `PLAN.md`, `ADR-001`, `HOSTING-CHECK.md`, `ASSUMPTIONS.md`, `DECISIONS.md` | **Đang thực hiện** |
| **Giai đoạn 1** | Thiết kế Prototype có tương tác, kiểm thử Viewport (360, 390, 1440), Design Gate | `docs/DESIGN.md`, Ứng dụng Prototype, Screenshots thực tế | **Đang thực hiện** |
| **Giai đoạn 2** | Database & Giao dịch nguyên tử (Supabase Postgres, RPC, Migrations, Seed) | SQL Migrations, Integration Tests (T06–T18, T22–T24) | Chờ duyệt TK |
| **Giai đoạn 3** | Hoàn thiện luồng Khách hàng (Catalog, Giỏ hàng, Ly đá, Đặt, Sửa/Hủy 60s) | Browser flow với 2 phiên khách riêng biệt | Tiếp sau |
| **Giai đoạn 4** | Quầy quản trị (Nhóm sân, Polling 3-5s, Chuông báo, CRUD Nước/Kho/Sân/QR) | Quầy vận hành, Chuông báo âm thanh thật, Xuất QR PNG/PDF | Tiếp sau |
| **Giai đoạn 5** | Báo cáo doanh thu & Lịch sử đơn & Xuất Excel | SQL Aggregates, Bộ lọc thời gian VN, File Excel đối chiếu | Tiếp sau |
| **Giai đoạn 6** | QA ma trận T01–T40 & Kiểm thử trình duyệt thực tế | `docs/QA-REPORT.md` (đủ 40 test với bằng chứng) | Tiếp sau |
| **Giai đoạn 7** | Triển khai Production (Cloudflare Workers + Supabase) | URL Production HTTPS, Smoke Test an toàn | Tiếp sau |
| **Giai đoạn 8** | Bàn giao & Tài liệu vận hành cho Chủ sân | Hướng dẫn quản trị, Backup, Nâng cấp dung lượng | Tiếp sau |

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
9. **Hạ tầng No-Card**: Khởi đầu hoàn toàn miễn phí, không yêu cầu thẻ ngân hàng (Cloudflare Workers + Supabase).
10. **Không đè hệ thống cũ**: Không làm hỏng QR cũ, không can thiệp database cũ khi chưa có kế hoạch chuyển đổi.
