# BẢN GHI NHẬN GIẢ ĐỊNH NGHIỆP VỤ (ASSUMPTIONS)

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Ngày cập nhật:** 06/09/2026  

---

1. **Quy mô ban đầu:**
   - Cơ sở duy nhất: Sân Cầu Lông Trần Lựu.
   - Số lượng sân khởi tạo: 16 sân, đánh số cố định từ `Sân 01` đến `Sân 16`.
   - Mỗi sân sở hữu một `court_id` (UUID v4) ổn định. Thay đổi tên sân không làm thay đổi URL của mã QR đã in.

2. **Khách hàng tại sân:**
   - Không yêu cầu tạo tài khoản, không cần nhập tên hoặc số điện thoại để giữ tốc độ đặt nước tối đa.
   - Phiên khách được lưu qua Cookie HttpOnly an toàn trên trình duyệt quét mã. Nếu khách xóa cookie hoặc đổi trình duyệt, họ sẽ không thấy danh sách đơn cũ của mình trên máy khách (nhưng đơn hàng tại quầy vẫn được lưu đầy đủ).

3. **Ly đá miễn phí:**
   - Khách có quyền chọn từ 0 đến N ly đá (với N là số chai nước của từng món).
   - Ly đá hoàn toàn miễn phí (0 VNĐ), không quản lý số lượng tồn kho đá tại quầy.
   - Khi khách giảm số lượng chai nước, hệ thống tự động kẹp (clamp) số ly đá tương ứng (ví dụ: từ 3 chai 3 đá giảm còn 1 chai thì đá tự về tối đa 1 ly).

4. **Thanh toán:**
   - 100% hình thức thanh toán khi nhận hàng (tiền mặt / chuyển khoản trực tiếp cho nhân viên mang nước ra sân).
   - Hệ thống không tích hợp cổng thanh toán trực tuyến (VNPAY, MoMo, ZaloPay...) để tránh phức tạp và phụ thuộc bên thứ ba.
   - Mốc trạng thái "Đã giao" đồng nghĩa với "Đã thu tiền" và chỉ ghi nhận doanh thu đúng 1 lần tại mốc này.

5. **Cửa sổ thời gian 60 giây:**
   - Đồng hồ đếm ngược được tính toán dựa trên mốc thời gian tuyệt đối từ server (`editable_until = created_at + 60s`), không dựa vào biến giảm dần ở client.
   - Khách chỉ được sửa hoặc hủy đơn khi `now < editable_until`.
   - Quầy chỉ nhận đơn và chuông báo chỉ kêu khi `now >= editable_until`.

6. **Chuông báo tại quầy:**
   - Chuông kêu lặp lại mỗi 5 giây chừng nào còn đơn ở trạng thái cần nhận.
   - Yêu cầu nhân viên bấm "Bật âm báo" ít nhất một lần khi mở ca làm việc để cấp quyền phát âm thanh tự động cho trình duyệt (Web Autoplay Policy).
