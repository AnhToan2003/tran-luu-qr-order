# TÀI LIỆU THIẾT KẾ GIAO DIỆN (DESIGN SPECIFICATION)

**Dự án:** Hệ thống gọi nước QR Sân Cầu Lông Trần Lựu  
**Phiên bản:** 1.0  
**Ngày:** 06/09/2026  

---

## 1. Định hướng thẩm mỹ & Tinh thần thiết kế

Sân Cầu Lông Trần Lựu là một không gian thể thao năng động, sạch sẽ và hiện đại. Giao diện được thiết kế với tiêu chí:
- **Chất thể thao tinh tế:** Bảng màu xanh lá sân đấu (#137A49) kết hợp xanh rừng sâu thẳm (#12432E), điểm xuyết sắc xanh vôi tươi (#D5EF76) gợi nhớ màu quả cầu lông thi đấu.
- **Tập trung vào mục đích:** Trang gọi nước là nơi mua nước nhanh bằng một tay giữa hiệp đấu — tuyệt đối không tạo banner quảng cáo hero chiếm hết màn hình làm che khuất thực đơn.
- **Rõ ràng và minh bạch:** Tên sân to rõ, hình ảnh chai nước chuẩn xác không bị méo/cắt nhãn, giá tiền rõ ràng, thao tác chọn ly đá miễn phí cực kỳ tự nhiên.
- **Tránh cảm giác template công nghiệp:** Không bo cong quá đà kiểu "pill-shaped", không đổ bóng mờ nhạt khắp nơi, không dùng các khối màu xám buồn tẻ.

---

## 2. Hệ thống Design Tokens

### 2.1 Bảng màu (Color Palette)
| Tên Token | Mã Hex | Vai trò & Ứng dụng |
|---|---|---|
| `--color-primary` | `#137A49` | Màu xanh thương hiệu, nút CTA chính (Đặt nước, Nhận đơn), trạng thái hoạt động |
| `--color-primary-hover` | `#0F643B` | Trạng thái hover/active của nút chính |
| `--color-deep` | `#12432E` | Màu xanh đậm cho tiêu đề, badge sân, thanh điều hướng quầy |
| `--color-accent` | `#D5EF76` | Màu xanh vôi nổi bật (lime), dùng cho badge trạng thái đặc biệt, viền nhấn thể thao |
| `--color-accent-text` | `#1B3B11` | Chữ tương phản cao đặt trên nền accent |
| `--color-bg` | `#F4F7F4` | Nền trang tổng thể (sắc trắng ngả xanh lục rất nhạt, dịu mắt) |
| `--color-surface` | `#FFFFFF` | Nền thẻ sản phẩm, card đơn hàng, modal bottom sheet |
| `--color-border` | `#E2E9E2` | Viền ngăn cách nhẹ nhàng, sắc nét |
| `--color-border-subtle` | `#EDF2ED` | Viền ngăn cách phụ |
| `--color-text-main` | `#182C22` | Màu chữ chính, độ tương phản đạt chuẩn WCAG AAA |
| `--color-text-muted` | `#5C6F62` | Màu chữ phụ, ghi chú dung tích, mô tả |
| `--color-status-warning` | `#D97706` | Trạng thái Chờ xác nhận (<60s), cảnh báo kho |
| `--color-status-info` | `#2563EB` | Trạng thái Đang chuẩn bị |
| `--color-status-success` | `#16A34A` | Trạng thái Đã giao & Đã thanh toán |
| `--color-status-danger` | `#DC2626` | Trạng thái Hủy đơn, hết hàng |

### 2.2 Typography
- **Phông chữ:** `Be Vietnam Pro`, `system-ui`, `-apple-system`, `sans-serif`.
- **Hệ thống phân cấp cỡ chữ:**
  - `Display / Court Badge`: 22px – 26px (Font weight 700)
  - `Heading 1 / Page Title`: 20px – 24px (Font weight 700)
  - `Heading 2 / Product Name`: 16px – 17px (Font weight 600)
  - `Price / Accent numbers`: 16px – 18px (Font weight 700)
  - `Body / Normal text`: 14px – 15px (Font weight 400 & 500)
  - `Caption / Subtext`: 12px – 13px (Font weight 500)

### 2.3 Khoảng cách & Bố cục (Spacing & Layout)
- Thang đo: 4px, 8px, 12px, 16px, 20px, 24px, 32px.
- Bo góc (Border Radius):
  - Card / Panel: `16px`
  - Button / Input: `10px` – `12px`
  - Badge / Tag: `6px` – `8px`
- Đổ bóng (Shadows):
  - Card bề mặt: `0 1px 3px rgba(18, 67, 46, 0.05), 0 1px 2px rgba(18, 67, 46, 0.03)`
  - Giỏ hàng / Bottom Sheet: `0 -4px 20px rgba(18, 67, 46, 0.12)`
  - Nút bấm nổi bật: `0 2px 6px rgba(19, 122, 73, 0.25)`

---

## 3. Cấu trúc Màn hình Khách (Mobile First)

1. **Thanh nhận diện đỉnh (Top Bar):**
   - Logo thương hiệu Trần Lựu + Chấm đèn trạng thái Quầy mở/đóng.
   - Nút "Đơn của bạn" xem nhanh lịch sử phiên hiện tại.
2. **Ngữ cảnh Sân thi đấu (Court Context Hero Mini):**
   - Không banner quảng cáo to. Ngay đầu trang hiển thị Badge lớn: **"Sân 05"** kèm dòng nhắc ngắn: *"Chọn nước giải khát, nhân viên sẽ mang ra tận sân."*
3. **Danh mục sản phẩm (Catalog Grid):**
   - Bố cục lưới 2 cột tối ưu (hoặc 1 cột trên màn hình siêu hẹp 360px).
   - Thẻ sản phẩm gồm:
     - Ảnh sản phẩm chuẩn tỷ lệ 4:3, `object-fit: contain` trên nền sạch sẽ, không méo hình.
     - Tên nước kèm dung tích rõ ràng (VD: *Pocari Sweat 500ml*).
     - Giá bán định dạng VNĐ nổi bật (VD: *20.000đ*).
     - Nút "Thêm" chuyển đổi thành cụm [- 1 +] mượt mà ngay tại card mà không gây giật giật layout.
4. **Thanh giỏ hàng nổi (Floating Cart Bar):**
   - Xuất hiện ghim đáy màn hình khi giỏ có hàng (có chừa khoảng safe-area cho iPhone).
   - Hiển thị số lượng món, tổng tiền tạm tính và nút "Xem giỏ hàng".
5. **Bottom Sheet Giỏ hàng & Chọn Ly Đá:**
   - Mỗi món nước có: Tên, dung tích, giá đơn vị, nút tăng giảm chai.
   - **Thanh chọn ly đá miễn phí**:
     - Mặc định chọn số ly đá = số chai nước.
     - Cho phép khách bấm tăng giảm số ly đá từ `0` đến `Số chai`.
     - Nếu giảm số chai, hệ thống tự động kẹp số ly đá không vượt quá số chai mới.
   - Hiển thị tóm tắt: Tiền nước, Tiền đá (Miễn phí), Tổng thanh toán.
   - Nút "Đặt giao tận sân" kèm ghi chú nhỏ nhắc khách: *"Có 60 giây để sửa hoặc hủy đơn sau khi đặt"*.
6. **Màn hình Theo dõi đơn hàng (Live Order Tracking):**
   - Mã đơn ngắn (VD: `#TL-0501`), Sân đặt, Danh sách món chi tiết.
   - Thanh tiến trình trực quan 4 bước:
     1. `Mới (Có 60s để sửa/hủy)`
     2. `Đã nhận`
     3. `Đang chuẩn bị`
     4. `Đã giao & thu tiền`
   - **Đồng hồ đếm ngược 60s thời gian thực** kèm 2 nút: **"Sửa đơn"** và **"Hủy đơn"**.
   - Hết 60s: Chuyển sang thông báo *"Quầy đang tiếp nhận đơn hàng"*, đồng thời vô hiệu hóa quyền sửa/hủy.

---

## 4. Cấu trúc Màn hình Quầy (Desktop & Tablet)

1. **Header điều hành trung tâm:**
   - Tên hệ thống: **Điều Hành Quầy Nước — Sân Cầu Lông Trần Lựu**.
   - Công tắc chung: "Nhận đơn: ĐANG MỞ" (Toggle On/Off).
   - Nút "Bật âm báo" & "Thử chuông": Kích hoạt Web Audio API đảm bảo chuông luôn kêu khi có đơn mới đủ 60s.
   - Bộ đếm đơn theo thời gian thực: Chờ duyệt | Cần nhận | Đang làm | Đã giao.
2. **Cột phân loại theo tiến trình xử lý:**
   - **Cột 1: Chờ xác nhận (<60s)**: Hiển thị các đơn khách vừa đặt đang trong 60s sửa/hủy. Quầy nhìn thấy nhưng nút "Nhận đơn" bị khóa kèm đồng hồ đếm ngược của đơn đó.
   - **Cột 2: CẦN NHẬN (>=60s)**: Đơn đã qua 60s, chuông quầy kêu ngân nga. Nút **"Nhận đơn"** màu xanh nổi bật.
   - **Cột 3: Đang chuẩn bị**: Đơn nhân viên quầy đang lấy nước và chuẩn bị đá. Nút hành động: **"Đã chuẩn bị xong"**.
   - **Cột 4: Đã giao & Thu tiền**: Đơn nhân viên mang ra sân thành công và đã thu tiền từ khách.
3. **Thẻ đơn hàng nhóm theo Sân (Court-Grouped Card):**
   - Header thẻ nổi bật: **SÂN 05** (Font size 20px đậm, viền xanh thể thao).
   - Mã đơn & Thời gian đặt.
   - Danh sách chi tiết: Số lượng chai, số ly đá (icon ly đá nổi bật để nhân viên không quên lấy đá).
   - Tổng tiền cần thu từ khách (VD: *40.000đ*).
   - Một nút hành động duy nhất chuyển sang bước tiếp theo, ngăn chặn bấm nhầm.
