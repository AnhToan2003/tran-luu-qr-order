# Kịch bản nghiệm thu dành cho Antigravity

## 1. Nhiệm vụ

Kiểm thử bản mã nguồn hiện tại của hệ thống gọi nước Trần Lựu trong thư mục:

`C:\Users\AnhToan\Desktop\Hệ thống oder nước`

Đọc mã hiện tại trước khi chạy. Dự án đang có nhiều thay đổi chưa commit; giữ nguyên các thay đổi đó. Không reset Git, không khôi phục phiên bản cũ, không kết luận theo báo cáo kiểm thử cũ.

Mục tiêu: chứng minh các chức năng giao diện thực sự gọi backend và ghi/đọc đúng MongoDB; kiểm tra tính nhất quán của đơn hàng, kho và doanh thu; phát hiện các lỗi còn sót. Trong lượt QA này không tự push hoặc deploy.

Quy tắc nghiệp vụ bắt buộc:

- Khách chỉ đặt và theo dõi đơn; không có quyền sửa hoặc hủy sau khi gửi, kể cả gọi API trực tiếp.
- Đơn mới vào `accepted`; quầy có thể chuyển `preparing` rồi `delivered`, hoặc hoàn tất trực tiếp từ `accepted`.
- Chỉ admin đăng nhập được thao tác quản trị và hủy đơn chưa giao. Hủy phải có lý do, hoàn kho đúng một lần.
- `delivered` và `cancelled` là trạng thái cuối. Doanh thu chỉ tính đơn đã giao.
- Số chai là số nguyên dương; số ly đá là số nguyên từ 0 đến số chai. Đá miễn phí.
- Giá tính theo dữ liệu sản phẩm tại backend; không tin giá/tổng tiền do client gửi.
- Đơn, biến động kho và nhật ký phải cùng thành công hoặc cùng hoàn tác.

## 2. Phạm vi dữ liệu và môi trường

Tất cả thao tác tạo/sửa/xóa/hủy, thử tranh chấp, thử lỗi mạng và lỗi database phải chạy trên database test biệt lập. Dữ liệu test được lưu thật vào MongoDB test, không thay API bằng mock để làm kiểm thử đạt.

Không ghi vào Railway production, MongoDB cục bộ `tran_luu_order`, database `bat_dong_san` hoặc database không thuộc phiên QA. Không đổi cấu hình dịch vụ MongoDB đang chạy ở cổng 27017. Không sửa `.env` thật hoặc in mật khẩu, cookie, token, URI có thông tin đăng nhập vào báo cáo.

Hai trang production chỉ dùng kiểm tra đọc nếu cần:

- https://tran-luu-qr-order-production.up.railway.app/admin
- https://tran-luu-qr-order-production.up.railway.app/order?court=05

Không dùng kết quả của production cũ để đánh giá bản sửa local.

## 3. Chuẩn bị và kiểm thử tự động

Chạy lần lượt trong PowerShell tại thư mục dự án. Lưu stdout/stderr vào `scratch/qa/`; ghi lại exit code từng lệnh. Nếu lệnh thất bại phải giải thích, không bỏ qua.

```powershell
node --version
git status --short
npm ci
npm test
npm run build
npm audit
```

Yêu cầu:

- Node.js >= 22.12.0.
- `npm test` dùng MongoDB replica set biệt lập qua `mongodb-memory-server`. Trên máy này có thể dùng binary `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`.
- Bộ test hiện có từng báo 13 test đạt, nhưng phải chạy lại. Ghi chính xác tổng pass/fail/skip của lần hiện tại.
- `npm run build` phải kiểm tra TypeScript của cả FE và BE, tạo `dist/index.html` và `dist-server/index.js`.
- Ghi advisory cụ thể nếu audit có cảnh báo; không chạy `npm audit fix --force` tùy tiện.
- Không coi `npm run build` hoặc HTTP 200 là bằng chứng toàn bộ nghiệp vụ hoạt động.

Nếu cổng 3101 đang có server test từ phiên trước, xác định đúng tiến trình và thư mục trước khi tái sử dụng hoặc dừng nó. Không kill toàn bộ tiến trình Node/MongoDB.

Sau khi build, mở terminal riêng:

```powershell
npm run test:ui:server
```

Server test hiện tại:

- User: http://127.0.0.1:3101/order?court=05
- Admin: http://127.0.0.1:3101/admin
- Tài khoản test: `admin` / `LocalTest-2026!`.
- Database: `tran_luu_ui_test` trên MongoDB replica set tạm, URI/cổng được script tạo riêng.
- Hai sân: 05 và 17.
- `test-water`: Nước test, giá 10.000đ, tồn 10.
- `test-tea`: Trà test, giá 15.000đ, tồn 10.

Đọc `scripts/preview-test.ts` để xác nhận cấu hình thực tế. Script đang ghi đè mật khẩu test nhưng chưa ép `ADMIN_USERNAME`; nếu `.env` dùng tên khác, chỉ đặt `ADMIN_USERNAME=admin` cho tiến trình test, không sửa `.env` thật.

Mở ba phiên trình duyệt/cookie jar độc lập: admin, khách A, khách B. Hai tab trong cùng profile thường chia sẻ cookie, không đủ để kiểm tra cách ly khách. Các đơn mẫu và lỗi được tạo ở môi trường test này.

## 4. Luồng nghiệm thu chính có số liệu đối chiếu

Chạy trên database UI test vừa khởi tạo. Hoàn thành luồng này trước các thử nghiệm làm thay đổi giá/kho. Nếu cần chạy lại từ đầu, chỉ khởi động lại server test do phiên QA tạo để có bộ dữ liệu mới.

| Bước | Thao tác | Kết quả cần chứng minh |
| --- | --- | --- |
| M01 | Khách A mở sân 05, thêm 2 Nước test + 1 Trà test, chọn tổng 2 ly đá | Giỏ 3 chai, 35.000đ, 2 ly đá miễn phí, sân 05 |
| M02 | Gửi đơn một lần | Một đơn `accepted`; kho Nước 8, Trà 9; chi tiết giỏ trả về đúng tên/giá/số lượng |
| M03 | Admin chờ chu kỳ đồng bộ | Đơn xuất hiện tại quầy đúng mã, sân và 35.000đ; tiền chờ thu 35.000đ, doanh thu thực thu 0đ |
| M04 | Khách B mở “Đơn của bạn” | Không thấy đơn của khách A |
| M05 | Admin bấm “Mang ra sân” | Đơn `preparing`; khách A tự cập nhật sau polling, không cần F5 |
| M06 | Admin bấm “Đã giao & thu tiền” | Đơn `delivered`; khách A hiện giao hoàn tất; kho vẫn 8/9; doanh thu 35.000đ; chờ thu 0đ |
| M07 | Khách A đặt tiếp 2 Nước test | Mã khác M02; kho Nước 6, Trà 9; doanh thu vẫn 35.000đ |
| M08 | Admin hủy đơn M07 với lý do “Kiểm thử hoàn kho” | Đơn `cancelled`, lưu lý do; kho Nước trở về 8, Trà 9; doanh thu vẫn 35.000đ |
| M09 | Gửi lại cùng yêu cầu hủy M08 | Không tăng kho thêm; chỉ một lần hoàn kho cho mỗi món |
| M10 | Admin tạo POS 1 Trà test cho sân 17 | Một đơn `accepted`, 15.000đ; kho Nước 8, Trà 8; chờ thu 15.000đ |
| M11 | Hoàn tất đơn POS | Tổng doanh thu 50.000đ; 2 đơn đã giao; 4 chai đã giao; 1 đơn đã hủy; chờ thu 0đ |
| M12 | Lọc lịch sử và xuất Excel | 3 đơn trong lịch sử; tổng doanh thu chỉ 50.000đ; đơn hủy không cộng doanh thu |

Mỗi bước đối chiếu giao diện, response API và bản ghi database test khi phù hợp. Không chỉ nhìn thông báo thành công.

## 5. Ma trận kiểm thử bổ sung

Các nhóm thay đổi dữ liệu dùng fixture mới hoặc ghi rõ baseline; không tiếp tục dùng số tồn/tổng tiền của M01–M12 sau khi đã thêm đơn khác.

### A. Đăng nhập và phân quyền

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| A01 | Mở `/admin` ở phiên mới | Hiện đăng nhập; không lộ bảng quản trị trước khi xác thực |
| A02 | Gọi API admin đọc và ghi không cookie | HTTP 401; không thay đổi dữ liệu |
| A03 | Sai mật khẩu rồi đúng mật khẩu | Sai trả 401 và báo rõ; đúng vào quầy |
| A04 | Đăng xuất rồi tái sử dụng cookie phiên cũ | API trả 401; giao diện quay lại đăng nhập |
| A05 | Cho session test hết hạn trong DB rồi chờ polling | Không tiếp tục cho thao tác bằng phiên hết hạn; có thông báo đăng nhập lại |
| A06 | Yêu cầu thay đổi có Origin khác website | Bị từ chối 403, dữ liệu giữ nguyên |
| A07 | Vượt giới hạn thử đăng nhập trên app test riêng | HTTP 429; không khóa nhầm toàn bộ phiên QA còn lại |
| A08 | Kiểm tra cookie trên HTTPS staging khi có | HttpOnly và Secure đúng môi trường; không yêu cầu Secure trên HTTP local test |

### B. Khách hàng và giỏ hàng

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| B01 | Mở sân hợp lệ, sân không tồn tại, mã sân sai kiểu | Đúng sân thật; lỗi phù hợp; không mặc nhiên chuyển sang sân khác |
| B02 | Thêm/tăng/giảm/xóa món, giảm số chai xuống dưới số ly đá | Tổng đúng; đá tự giảm theo chai; không có số âm |
| B03 | Chọn vượt tồn kho, sản phẩm vừa hết hàng | Không tạo đơn vượt tồn; báo rõ và cho cập nhật giỏ |
| B04 | API gửi 0, âm, 1.5, chuỗi số, thiếu quantity, ice > quantity, productId lặp | 400, không có đơn hoặc biến động kho |
| B05 | Giả giá/tổng tiền từ client | Không được sử dụng để tính tiền; từ chối trường ngoài hợp đồng hoặc tính theo giá server |
| B06 | Khách gọi `POST /api/orders/:id/cancel` và `PATCH /api/orders/:id` | Luôn 403, kể cả đơn do chính phiên đó tạo |
| B07 | Khách mở danh sách sau nhiều đơn đã giao/hủy | Mở được đúng đơn; hiển thị trạng thái cuối, không giữ trạng thái cũ |
| B08 | Đổi ảnh/tên sản phẩm tại admin rồi mở giỏ khách | Hiển thị từ dữ liệu API; không còn phụ thuộc ảnh/danh mục mock cũ |
| B09 | Mất kết nối API hoặc API trả 500 | Có lỗi nhìn thấy; không hiển thị là đặt thành công; nút không bị kẹt vĩnh viễn |
| B10 | Giá đổi sau khi khách mở giỏ | Ghi nhận hành vi hiện tại; tổng đơn phải khớp giá backend và khách phải thấy rõ số tiền cuối. Báo lỗi nếu giao diện vẫn báo giá cũ như đã chốt |

### C. Đồng thời, gửi lại và giao dịch kho

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| C01 | 6 yêu cầu đồng thời cùng session + clientRequestId + payload | Chỉ một đơn, trừ kho một lần; các phản hồi hợp lệ trỏ cùng id |
| C02 | Cùng mã yêu cầu nhưng payload khác | 409 REQUEST_CONFLICT; không phát sinh đơn khác |
| C03 | Hai khách độc lập mua chai cuối cùng | Chính xác một đơn thành công; người còn lại lỗi hết hàng; tồn 0 |
| C04 | Tạo ít nhất 100 đơn hợp lệ của cùng sân trên fixture đủ hàng | Không trùng orderId/displayCode; tổng trừ kho đúng số đơn |
| C05 | Giỏ nhiều món, món sau hết hàng | Món trước không bị trừ kho; không lưu đơn hoặc audit dang dở |
| C06 | Cố tình làm ghi audit thất bại trong DB test | Toàn bộ đơn và tồn kho rollback; log lỗi không chứa bí mật |
| C07 | 4 yêu cầu hủy đồng thời cùng đơn | Đơn hủy một lần; kho hoàn một lần; lý do/người hủy được ghi |
| C08 | Hủy và giao cùng lúc | Chỉ một trạng thái cuối thắng; nếu giao thì không hoàn kho, nếu hủy thì không ghi doanh thu |
| C09 | Hai admin cùng hoàn tất một đơn | Một lần ghi nhận giao/thu tiền; thời điểm giao không bị thay đổi bởi retry |
| C10 | Mất response sau khi server đã lưu đơn, sau đó khách thử lại | Dùng lại cùng clientRequestId, không tạo đơn thứ hai. Phải thử cả frontend, không chỉ service |
| C11 | Tranh chấp đặt đơn với tắt quầy/tắt hoặc xóa sân | Không xuất hiện trạng thái dữ liệu mâu thuẫn; đơn hợp lệ phải có sân còn trong lịch sử; xóa sân có đơn mở bị chặn |
| C12 | Nhập kho lặp cùng mã yêu cầu; thay payload nhưng giữ mã | Retry không cộng lần hai; payload khác phải bị từ chối hoặc được báo rõ, không trả thành công gây hiểu nhầm |

Không chạy failpoint, collMod hoặc gây mất kết nối vào DB thật. Sau C06 phải phục hồi validator/failpoint của DB test trong `finally`. Nếu chưa có công cụ mô phỏng mất response, ghi BLOCKED và lý do; không tự đánh dấu C10 PASS vì C01 đã qua.

### D. Quản trị sản phẩm, kho và sân

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| D01 | Thêm sản phẩm bằng form; tải lại trang | Sản phẩm lưu thật; hiện trên menu khách nếu đang bán và có hàng |
| D02 | Sửa tên, giá, dung tích, ảnh, trạng thái bán | FE và DB khớp; không xóa ảnh/tag do cập nhật trường khác |
| D03 | Nhấn lưu liên tục/đôi | Không tạo nhiều bản ghi ngoài ý muốn; lỗi có thông báo rõ |
| D04 | Nhập thêm 5 chai | Tồn tăng đúng 5; lịch sử kho ghi delta và stockAfter chính xác |
| D05 | Hai admin sửa tồn tuyệt đối từ cùng số cũ | Người dùng dữ liệu cũ nhận lỗi xung đột; không ghi đè phần bán/nhập vừa xảy ra |
| D06 | Nhập số âm, lẻ, quá giới hạn hoặc giá không hợp lệ | Bị từ chối ở API; database không hỏng |
| D07 | Xóa mềm sản phẩm đã từng có đơn | Menu ẩn sản phẩm; lịch sử giữ tên/giá cũ; hoàn kho đơn chưa giao vẫn đúng |
| D08 | Thêm sân mới rồi đổi tên | Header, danh sách, POS, QR lấy số sân/tên thật; không cố định 16 |
| D09 | Tắt/mở sân và tắt/mở toàn quầy | Khách và admin đồng bộ sau polling; F5 vẫn giữ trạng thái đã lưu |
| D10 | Xóa sân có đơn mở và sân không có đơn mở | Có đơn mở: 409; không có: xóa mềm đúng; đơn lịch sử không mất |
| D11 | POS khi quầy/sân tắt hoặc sản phẩm hết/ngừng bán | Không lách kiểm tra bằng luồng POS; lỗi rõ ràng |

### E. Báo cáo, lịch sử và file xuất

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| E01 | Dựng fixture ở 23:59:59 hôm qua và 00:00:00 hôm nay giờ Việt Nam | Bộ lọc hôm qua/hôm nay không chồng lấn; không phụ thuộc timezone máy chạy |
| E02 | So sánh hôm nay, hôm qua, 7 ngày, tháng này, tất cả | Biên ngày đúng và tổng tính lại từ fixture khớp |
| E03 | Đơn delivered cũ trong API quầy | Không nằm ở “Đã hoàn tất hôm nay” |
| E04 | Hơn 200 đơn, có nhiều đơn trùng createdAt | Phân trang không thiếu/trùng; lọc sân/trạng thái đúng |
| E05 | Xuất Excel khi mới tải trang đầu | File chứa đủ toàn bộ dữ liệu đúng bộ lọc, không chỉ 100 dòng |
| E06 | Mở file XLSX thực tế bằng thư viện đọc hoặc ứng dụng | Có 5 sheet; số dòng, trạng thái, tổng tiền và ngày giờ đúng; không lỗi file |
| E07 | Tên sân/món bắt đầu bằng `=`, `+`, `-`, `@` trong fixture | Không trở thành công thức nguy hiểm khi mở file |
| E08 | QR PNG cho sân 05/17 và sân vừa thêm | Giải mã được URL đúng origin + mã sân; mở đúng menu sân |
| E09 | PDF với số sân không chia hết cho 4, tên tiếng Việt dài | Đủ tất cả sân, không mất sân cuối, không lỗi dấu hoặc tràn chữ, QR đọc được |

### F. Giao diện và vận hành

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| F01 | Kiểm tra ở 360, 390, 768, 1440px | Không mất nút hoặc tràn ngang gây cản thao tác; modal cuộn được |
| F02 | So sánh Network khi mở khách, admin, xuất Excel/PDF | Trang khách không tải trước thư viện Excel/PDF/admin; báo dung lượng tải thực tế, không chỉ tổng thư mục dist |
| F03 | Quan sát console/network toàn luồng | Không có exception chưa xử lý, request thất bại bị nuốt, lỗi CSP ảnh/chunk |
| F04 | Bật chuông, có đơn chờ, chuyển tab và hoàn tất đơn | Chuông hoạt động theo trạng thái, không sinh nhiều timer; ghi rõ có/không kiểm chứng được âm thanh thực tế |
| F05 | API timeout, session hết hạn trong lúc thao tác | Nút hết loading hợp lý; không báo thành công giả; có đường thử lại/đăng nhập |
| F06 | Build khi `.env` đặt NODE_ENV=development | Artifact vẫn là production build nhờ `scripts/build.mjs`; không sửa `.env` thật để thử |
| F07 | Khởi động compiled server với cấu hình production trên DB test replica set | Chạy bằng `node dist-server/index.js`; health kiểm tra DB; không tự seed sản phẩm/sân mẫu |
| F08 | Khởi động với standalone hoặc thiếu cấu hình admin trong tiến trình test | Từ chối khởi động rõ ràng; không âm thầm quay về rollback thủ công hoặc mở API không xác thực |
| F09 | Dừng/khởi động lại app trên cùng DB test còn chạy | Đơn/kho không mất, không seed lại, session hợp lệ xử lý đúng; không dùng việc restart server UI làm test persistence vì script đó tạo DB tạm mới |

## 6. Lưu bằng chứng và báo lỗi

Tạo `docs/QA-RESULTS-ANTIGRAVITY.md` với:

1. Thời gian, revision/working tree, phiên bản Node/MongoDB, lệnh chạy và môi trường.
2. Bảng từng ID: PASS / FAIL / BLOCKED / NOT RUN, observed result và đường dẫn bằng chứng.
3. Kết quả luồng M01–M12, đối chiếu kho và doanh thu trước/sau.
4. Mỗi lỗi: mức độ P1/P2/P3, bước tái hiện ngắn nhất, expected/actual, file/dòng liên quan nếu tìm được.
5. Kết quả build, automated tests, audit, dung lượng bundle thực tế.
6. Danh sách phần chưa kiểm tra; không gọi là “đã test hết” khi còn BLOCKED hoặc NOT RUN.

Lưu log/ảnh/file xuất trong `scratch/qa/`. Che thông tin phiên đăng nhập. Chỉ chụp màn hình chưa đủ chứng minh transaction; cần API/DB assertions. Không sửa assertion cho khớp lỗi, không bỏ test thất bại và không sử dụng dữ liệu mock để thay thế DB trong test giao dịch.

Nếu sửa lỗi trong phạm vi đã được chủ dự án cho phép: bổ sung test hồi quy có ý nghĩa, chạy lại nhóm liên quan và build cuối. Ghi rõ file đã sửa. Nếu chỉ được giao chạy QA, báo lỗi để chủ dự án quyết định phần sửa.

## 7. Điều kiện bàn giao để triển khai

- Luồng M01–M12 PASS và các lỗi P1 đã đóng bằng bằng chứng kiểm thử lại.
- Quyền khách không hủy/sửa, admin auth, transaction và cạnh tranh kho đều PASS.
- FE/BE build cùng revision; các chỉnh sửa sau lần build/test cuối đã được kiểm tra lại.
- File Excel/PDF và cấu hình production được kiểm tra hoặc nêu rõ là chưa đạt.
- Xác minh topology MongoDB production, cấu hình tài khoản admin, backup/restore và quyền truy cập Railway trước khi deploy.
- Không đổi production sang bản bắt buộc replica set khi chưa xác minh database đáp ứng.
- Kết luận dùng một trong: **Đủ điều kiện chuyển sang bước triển khai**, **Cần sửa thêm**, **Bị chặn bởi môi trường**. Báo cáo QA không đồng nghĩa đã deploy.

## Prompt ngắn để giao cho Antigravity

> Đọc `docs/ANTIGRAVITY-QA.md` và chạy QA trên working tree hiện tại. Trước tiên chạy test/build, sau đó kiểm tra luồng M01–M12 và toàn bộ ma trận A–F bằng dữ liệu lưu thật trên MongoDB test biệt lập. Giữ quy tắc khách không được sửa/hủy đơn; chỉ admin hủy đơn chưa giao và hoàn kho một lần. Không tác động production, không reset thay đổi hiện có, không push/deploy trong lượt QA này. Không chỉ đọc code để kết luận PASS. Ghi kết quả từng ID, lỗi tái hiện và bằng chứng vào `docs/QA-RESULTS-ANTIGRAVITY.md`; đánh dấu rõ BLOCKED/NOT RUN. Nếu được yêu cầu sửa lỗi, thêm test hồi quy và chạy lại trước khi báo hoàn tất.
