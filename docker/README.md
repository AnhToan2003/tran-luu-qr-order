# Docker local integration environment

The local stack is intentionally separate from `docker-compose.prod.yml` and
uses only localhost port `3101` for the application. MongoDB and Redis are on
an internal Docker network and are not published to Windows.

```powershell
docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d --build
docker compose --env-file .env.docker.local -f docker-compose.local.yml ps
```

Smoke checks:

```powershell
curl http://localhost:3101/api/health
curl http://localhost:3101/
```

Stop the stack without deleting its local database volumes:

```powershell
docker compose --env-file .env.docker.local -f docker-compose.local.yml down
```

`.env.docker.local` and the Mongo keyfile are ignored by Git. Never copy the
local file or its credentials into production; production must use the real
`.env.production` values and a deployment-managed Mongo keyfile.
