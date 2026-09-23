import { defineRailway, github, preserve, project, redis, service } from "railway/iac";

// Last resort for a per-service CaC repo. Prefer one .railway file for the
// project and drop this if you later combine services into that file.
export const partial = "tran-luu-qr-order";

export default defineRailway(() => {
  const cache = redis("Redis");
  const tran_luu_qr_order = service("tran-luu-qr-order", {
    source: github("AnhToan2003/tran-luu-qr-order"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "/Dockerfile",
      buildEnvironment: "V3",
    },
    start: "npm run start",
    healthcheck: "/api/health",
    healthcheckTimeout: 30,
    env: {
      // Railway must always run the hardened production code path.
      NODE_ENV: "production",
      PORT: preserve(), // Railway injects the runtime PORT automatically.
      PUBLIC_ORIGIN: preserve(),
      MONGO_URI: preserve(),
      DB_NAME: "tran_luu_qr_order",
      ALLOW_STANDALONE: "false",

      ADMIN_USERNAME: preserve(),
      ADMIN_PASSWORD_HASH: preserve(),
      QR_SIGN_SECRET: preserve(),
      QR_SIGN_SECRET_LEGACY: preserve(),
      COOKIE_SECRET: preserve(),

      REDIS_ENABLED: "true",
      REDIS_URL: cache.env.REDIS_URL,
      TRUSTED_PROXY_CIDRS: preserve(),
      CUSTOMER_SESSION_TTL_HOURS: preserve(),
      LOG_LEVEL: "info",
      LOG_REQUESTS: "false",
      LOG_INCLUDE_STACK: "false",
    },
  });
  return project("radiant-possibility", {
    resources: [cache, tran_luu_qr_order],
  });
});
