# Production hardening — implementation and acceptance

Status: in progress. No claim of zero risk or complete production validation.

1. Repair security and transaction regressions; tests must call real services/API,
   fail on fixture creation errors, and assert database outcomes.
2. Repair purge step-up authentication, failed-password throttling, secret
   redaction, payment state rules and backup field preservation.
3. Make health/readiness, trusted proxy handling, Redis recovery and shutdown
   suitable for production. Keep production secrets deployment-managed.
4. Serve Swagger assets locally; document all API methods, cookie/customer
   authentication, proof headers, schemas and errors; enforce route parity.
5. Improve frontend error recovery, request timeouts and accessible zoom.
6. Verify through unit/integration tests, build and dependency audit; exercise
   production mode with isolated fixtures. Production smoke checks must identify
   the actual deployment and must not pollute business data.
7. Document VPS TLS/proxy setup, encrypted offsite backups and restore drills.

Acceptance evidence must distinguish automated assertions, manual observations,
and unverified operational requirements. Coverage percentages alone are not
proof of correctness. Destructive/load tests use disposable databases only.
