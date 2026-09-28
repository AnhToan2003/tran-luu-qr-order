# Vận hành và chẩn đoán

## Tách biệt staging và production

Hai môi trường dùng cùng image/code nhưng tách hoàn toàn project Docker, cổng host,
MongoDB, Redis, volume, network, keyfile, cookie/QR secret và backup. Staging vẫn đặt
`NODE_ENV=production` để kiểm tra đúng cookie Secure, fail-fast, CSP và rate limit.

| Thành phần | Staging | Production |
|---|---|---|
| Env file | `.env.staging` | `.env.production` |
| Compose project | `tran-luu-staging` | `tran-luu-production` |
| Host port mặc định | `3002` | `3001` |
| Database | `tran_luu_qr_order_staging` | `tran_luu_qr_order` |
| Proxy subnet | `172.30.0.0/24` | `172.29.0.0/24` |
| Mongo keyfile | `mongo-keyfile-staging` | `mongo-keyfile` |

Khởi tạo staging lần đầu:

```powershell
npm run generate:secrets:staging
# Sửa PUBLIC_ORIGIN trong .env.staging thành domain HTTPS staging thật.
npm run staging:config
npm run staging:up
npm run staging:logs
```

Kiểm tra và dừng staging:

```powershell
npm run check:staging
npm run staging:down
```

Production tiếp tục dùng riêng:

```powershell
npm run generate:secrets
npm run production:config
npm run production:up
npm run check:prod:strict
```

Không sao chép `.env.production`, volume database, Redis volume, Mongo keyfile hoặc
backup production sang staging. Reverse proxy phải ánh xạ domain staging tới
`127.0.0.1:3002` và domain production tới `127.0.0.1:3001`. Nếu hai môi trường nằm
trên hai máy khác nhau, vẫn giữ bộ secret và database riêng như trên.

## Nguyên tắc

- Ứng dụng không còn dashboard monitor hoặc endpoint `/monitor` và `/api/monitor/*`.
- Log vận hành được ghi dạng JSON ra stdout. Railway và Docker đều thu được log này, không cần lưu metric trong MongoDB.
- Mỗi request có `x-request-id`. Khi người dùng báo lỗi, lấy request ID từ response/header rồi tìm đúng dòng `http.request` hoặc `api.error`.
- Query string, cookie, authorization, password, token, secret và URI có credential không được ghi vào log.

## Đọc lỗi local

```powershell
npm test
npm run build
npm run check:prod:strict
docker compose -f docker-compose.local.yml --env-file .env.docker.local logs -f app
```

Log lỗi có các trường chính: `timestamp`, `level`, `event`, `requestId`, `method`, `path`, `statusCode`, `code`, `durationMs`.

## Đọc lỗi Railway

```powershell
railway status
railway logs --latest --lines 200
railway logs --http --status 500 --lines 100
railway logs --http --status ">=400" --lines 100
railway logs --network --direction egress --status dropped --lines 100
```

Không dùng `railway variable list --json` hoặc `--kv` trong terminal được chia sẻ vì hai chế độ đó in raw secret. Chỉ kiểm tra tên/giá trị không nhạy cảm khi cần.

## Cấu hình log

- `LOG_LEVEL=info`: mức mặc định production; dùng `debug` tạm thời khi điều tra lỗi.
- `LOG_REQUESTS=false`: chỉ ghi request 4xx/5xx. Đặt `true` trong thời gian ngắn để phân tích luồng thành công.
- `LOG_INCLUDE_STACK=false`: không ghi stack production. Chỉ bật có thời hạn khi cần và phải tắt sau khi điều tra.

Sau khi đổi biến môi trường Railway, redeploy service và kiểm tra `/api/health`.

## Kiểm tra release

1. Chạy `npm test` và `npm run build`.
2. Kiểm tra `git diff --check` và chắc chắn không có `.env`/keyfile trong staged files.
3. Push `main`; Railway phải dùng Dockerfile, healthcheck `/api/health`, `NODE_ENV=production`, MongoDB Replica Set và Redis.
4. Smoke test `/`, `/api/health`, đăng nhập admin, một luồng đọc catalog, một luồng tạo đơn, và một luồng cập nhật tồn kho.
5. Kiểm tra log startup có `Tran Luu Order API v2 ready`, Redis connected và không có `Startup failed`.

## Backup production và khôi phục

- Service `backup` trong `docker-compose.prod.yml` chạy backup mã hóa và restore drill theo `BACKUP_INTERVAL_HOURS`.
- `BACKUP_OFFSITE_HOST_PATH` phải là mount/ổ lưu trữ độc lập với volume MongoDB; không đặt nó trên cùng volume dữ liệu Mongo.
- Healthcheck của service backup chỉ xanh khi một chu kỳ backup + restore drill đã hoàn thành gần đây.
- Theo dõi trạng thái bằng `docker compose -f docker-compose.prod.yml ps backup` và chuyển container unhealthy/restart thành cảnh báo vận hành.
- Kiểm tra định kỳ rằng bản sao off-site còn tải xuống và giải mã được; checksum `.sha256` chỉ kiểm tra toàn vẹn, không thay thế restore drill.

Ứng dụng production áp dụng Mongo collection validators khi khởi động. App user mới được tạo với `readWrite` và `dbAdmin` chỉ trên database ứng dụng. Với volume Mongo đã tồn tại từ bản cũ, root admin cần chạy một lần:

```javascript
use tran_luu_qr_order
db.grantRolesToUser('<MONGO_APP_USER>', [
  { role: 'readWrite', db: 'tran_luu_qr_order' },
  { role: 'dbAdmin', db: 'tran_luu_qr_order' }
])
```

Không cấp các role này trên database `admin` và không dùng root credential trong application container.

`railway run npm run check:prod:strict` chạy từ Windows không nhìn thấy các hostname
`.railway.internal`; đó là giới hạn DNS private network, không phải kết luận service hỏng.
Kiểm tra Mongo/Redis private phải chạy trong container bằng `railway ssh` hoặc dùng các
health signal/logs của deployment.

`npm run check:prod` trên máy phát triển chỉ là kiểm tra local/staging và sẽ cảnh báo khi
phải đổi từ hostname Docker sang `127.0.0.1`. Chỉ kết quả `check:prod:strict` chạy bên
trong đúng network production mới được dùng làm bằng chứng sẵn sàng triển khai.

Mã QR mới dùng tag HMAC 128-bit. Chỉ đặt `QR_ALLOW_LEGACY_TAGS=true` trong thời gian
ngắn khi thay các mã QR 48-bit cũ; strict production cố ý từ chối cấu hình tương thích này.

## Hướng mở rộng observability

Giữ Railway logs/metrics làm lớp cơ bản. Khi cần alert và tracing đa instance, tích hợp Sentry hoặc OpenTelemetry Collector qua secret/endpoint riêng (`SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`) thay vì đưa dashboard debug vào ứng dụng nghiệp vụ. Tích hợp đó nên là một change riêng, có sampling và chính sách loại bỏ dữ liệu nhạy cảm.
