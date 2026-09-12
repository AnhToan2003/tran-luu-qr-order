# Kiểm tra production ngày 11/09/2026

Thời điểm kiểm tra: khoảng 07:41–07:46 giờ Việt Nam.

- Admin: https://tran-luu-qr-order-production.up.railway.app/admin
- Khách: https://tran-luu-qr-order-production.up.railway.app/order?court=05
- Phạm vi: trình duyệt thật, HTTP API không có Authorization/cookie quản trị, đối chiếu mã frontend triển khai và mã backend trong workspace.
- Không tạo đơn thật, đổi trạng thái đơn, sửa tồn kho, sửa giá hoặc công tắc nhận đơn. Chỉ gửi hai yêu cầu đặt đơn thiếu dữ liệu để kiểm tra phản hồi 400; cả hai bị từ chối.

## Kết luận

Website và các API đọc đang hoạt động. Chưa đủ điều kiện kết luận toàn bộ tác vụ backend đều đúng. Có lỗi trực tiếp trên production và các lỗi xử lý dữ liệu đã tái hiện bằng mô phỏng ở workspace.

## Kết quả xác nhận trực tiếp

| Hạng mục | Kết quả |
| --- | --- |
| Health | HTTP 200, production |
| Menu sân 05 | HTTP 200, đúng sân và 6 sản phẩm |
| Menu so với kho admin | Tên, giá, tồn kho khớp tại thời điểm kiểm tra |
| Giỏ hàng | Thêm LaVie, tăng 1 → 2 chai: 10.000 → 20.000đ |
| Ly đá | Chặn tăng quá số chai; giảm 2 → 1 chai tự giảm đá 2 → 1 |
| Xóa món | Giỏ trống, không còn nút gửi đơn trong giỏ |
| Phiên khách mới | `/api/orders/my` trả mảng rỗng; cookie HttpOnly, Secure, SameSite=Lax |
| Dữ liệu không hợp lệ | Thiếu clientRequestId hoặc giỏ rỗng trả 400; sân 99 không tồn tại trả 404 |
| Danh sách sân | 17 sân đang hoạt động |
| Lịch sử | 13 đơn: 12 delivered và 1 accepted |
| Tổng doanh thu | Tính lại từ lịch sử khớp API và giao diện: 541.000đ, 12 đơn, 35 chai, 35 ly đá |
| Tiền chờ thu | 10.000đ, 1 đơn |
| Tổng tiền từng đơn | Không thấy sai lệch giữa tổng đơn và tổng dòng hàng trong 13 đơn hiện có |

Kho khi kiểm tra: LaVie 39, Revive 34, Pocari 31, Trà Xanh 24, Red Bull 19, Highlands 15. Đây chỉ là đối chiếu hai API, không chứng minh toàn bộ lịch sử nhập/xuất kho chính xác.

## Lỗi thấy trên production

### P1 — Dữ liệu quản trị đọc được không cần đăng nhập

Mở `/admin` vào thẳng giao diện. HTTP client mới, không có cookie hay Authorization, nhận HTTP 200 từ `/api/admin/products`, `/courts`, `/orders/active`, `/reports/history`, `/reports/summary`.

Backend workspace không gắn middleware xác thực cho admin router. Chưa thực hiện thao tác ghi trái quyền trên production; việc API ghi không có bảo vệ được xác định từ mã nguồn, không từ thử sửa dữ liệu thật.

### P2 — “Đã hoàn tất hôm nay” hiển thị đơn cũ

Ngày kiểm tra 11/09, cột này hiển thị 12 đơn đã giao. `deliveredAt` của chúng thuộc các ngày 06/09, 07/09 và 09/09 theo giờ Việt Nam. Báo cáo hôm nay đồng thời trả 0 đơn, 0đ.

`server/routes/adminRoutes.ts` lấy 20 đơn delivered mới nhất, không lọc ngày; `src/components/AdminOrdersView.tsx` chỉ lọc status nhưng đặt tiêu đề “hôm nay”.

### P2 — Số sân trên tiêu đề không đồng bộ

API và tab sân hiển thị 17 sân, nhưng header vẫn ghi “16 Sân thi đấu”; nút PDF vẫn ghi “16 SÂN”. Chưa kiểm tra nội dung PDF xuất ra, nên không kết luận PDF thiếu sân.

## Lỗi xác định bằng đối chiếu mã triển khai và workspace

### P1 — Nút hủy admin dùng sai luồng

Bundle production `/assets/index-C3rZDN0K.js` gọi `POST /api/orders/${id}/cancel`, sau đó reload mà không kiểm tra `res.ok`. Mã nguồn frontend tương ứng ở `src/components/AdminOrdersView.tsx`.

Backend workspace yêu cầu session sở hữu đơn, status `new`, và còn hạn chỉnh sửa cho endpoint này. Đơn hiện được tạo thẳng `accepted`, `editableUntil = createdAt`. Không có endpoint hủy dành riêng cho admin trong mã hiện tại. Nút hủy vì vậy không có luồng hợp lệ theo triển khai backend trong workspace. Chưa bấm xác nhận hủy đơn thật để chứng minh trên production.

### P2 — Công tắc nhận đơn có thể hiển thị sai sau tải lại

`AdminPortal.tsx` khởi tạo `isAcceptingOrders = true`, chỉ đổi state sau click, không đọc cấu hình hệ thống khi tải trang. Chưa tắt quầy thật để thử; đây là kết luận từ mã frontend.

### P2 — Lịch sử và Excel bị giới hạn 100 đơn

Backend `/reports/history` dùng `.limit(100)` không có phân trang; nút Excel xuất chính `historyOrders`. Hiện mới có 13 đơn nên chưa gây mất dòng ở dữ liệu đang có, nhưng khi vượt 100 đơn sẽ không xuất đầy đủ toàn bộ lịch sử theo bộ lọc.

## Các rủi ro backend từ lần kiểm tra workspace

Các mục sau không được cố tình gây ra trên production:

1. **P1: Đơn và kho không đồng bộ khi ghi audit thất bại.** Mô phỏng cho thấy đơn accepted vẫn tồn tại nhưng tồn kho đã được hoàn toàn bộ.
2. **P1: Mã đơn bị trùng.** Mã khách có 90 hậu tố ngẫu nhiên mỗi sân, trong khi displayCode unique toàn bộ lịch sử; mô phỏng trùng hậu tố khiến đơn mới thất bại.
3. **P1: Đơn đã giao có thể mở lại.** Mô phỏng transition delivered → accepted thành công, ảnh hưởng báo cáo.
4. **P2: Thiếu kiểm tra số nguyên.** Mô phỏng đặt 1,5 chai thành công; kho giảm còn số lẻ.
5. **P2: Bộ lọc hôm qua thiếu mốc kết thúc.** Chỉ có `$gte`, nên có thể gồm hôm nay; phép tính ngày phụ thuộc timezone server. Dữ liệu hôm qua/hôm nay hiện đều 0 nên chưa tái hiện sai số trực tiếp.
6. **P2: Kiểm tra TypeScript backend thất bại.** `npx tsc --project tsconfig.server.json --noEmit` báo lỗi import NodeNext và lỗi kiểu liên quan. `npm run build` thành công nhưng tsconfig build chỉ include `src`, không chứng minh backend type-check đạt.

## Chưa nghiệm thu

- Đặt đơn thật → trừ kho → quầy xử lý → thu tiền → báo cáo.
- Hai khách tranh chai cuối, gửi đồng thời/retry, lỗi mạng giữa các bước.
- CRUD sản phẩm/sân, nhập kho, hoàn kho và công tắc nhận đơn.
- Nội dung file Excel/PDF tải xuống, âm thanh thực tế.
- Backend production có đúng toàn bộ cùng revision với workspace hay không: frontend bundle đối chiếu được, server không cung cấp revision.

Để nghiệm thu các tác vụ ghi, cần chạy trên database thử nghiệm biệt lập hoặc một quy trình test production có dữ liệu thử được thống nhất. Không dùng các kết quả đọc thành công để kết luận giao dịch kho/đơn đã an toàn.
