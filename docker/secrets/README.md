# Production secret provisioning

Generate the MongoDB keyfile on the deployment host and keep it outside Git:

```bash
mkdir -p docker/secrets
openssl rand -base64 756 > docker/secrets/mongo-keyfile
chmod 400 docker/secrets/mongo-keyfile
```

The production compose file mounts this file as a Docker secret. Provision
the remaining values through `.env.production` or the deployment secret
manager before starting the stack.
