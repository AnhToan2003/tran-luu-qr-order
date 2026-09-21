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
      NODE_ENV: preserve(),
      PUBLIC_ORIGIN: preserve(),
      MONGO_URI: preserve(),
      DB_NAME: "tran_luu_qr_order",
      ADMIN_USERNAME: preserve(),
      ADMIN_PASSWORD_HASH: preserve(),
      QR_SIGN_SECRET: preserve(),
      COOKIE_SECRET: preserve(),
      REDIS_ENABLED: "true",
      REDIS_URL: cache.env.REDIS_URL,
    },
  });
  return project("radiant-possibility", {
    resources: [cache, tran_luu_qr_order],
  });
});
