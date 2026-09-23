# Vận hành và chẩn đoán

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

`railway run npm run check:prod:strict` chạy từ Windows không nhìn thấy các hostname
`.railway.internal`; đó là giới hạn DNS private network, không phải kết luận service hỏng.
Kiểm tra Mongo/Redis private phải chạy trong container bằng `railway ssh` hoặc dùng các
health signal/logs của deployment.

## Hướng mở rộng observability

Giữ Railway logs/metrics làm lớp cơ bản. Khi cần alert và tracing đa instance, tích hợp Sentry hoặc OpenTelemetry Collector qua secret/endpoint riêng (`SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`) thay vì đưa dashboard debug vào ứng dụng nghiệp vụ. Tích hợp đó nên là một change riêng, có sampling và chính sách loại bỏ dữ liệu nhạy cảm.
