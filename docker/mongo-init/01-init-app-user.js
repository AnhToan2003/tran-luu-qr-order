// docker/mongo-init/01-init-app-user.js
// This script runs once when MongoDB container is first initialized.
// It creates the application database user with least-privilege permissions.
// Root credentials (MONGO_INITDB_ROOT_*) are used only here, never by the app.
//
// Required environment variables (set in docker-compose.prod.yml):
//   MONGO_ROOT_USER       — root username for initial setup
//   MONGO_ROOT_PASSWORD   — root password for initial setup
//   MONGO_APP_USER        — application database username
//   MONGO_APP_PASSWORD    — application database password
//   DB_NAME               — database name (default: tran_luu_qr_order)

const dbName = process.env.DB_NAME || 'tran_luu_qr_order';
const appUser = process.env.MONGO_APP_USER;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appUser || !appPassword) {
  print('[FATAL] MONGO_APP_USER and MONGO_APP_PASSWORD must be set in environment.');
  quit(1);
}

// Create application database
const appDb = db.getSiblingDB(dbName);

// Create app user with readWrite on app DB only (least privilege)
appDb.createUser({
  user: appUser,
  pwd: appPassword,
  roles: [
    { role: 'readWrite', db: dbName }
  ]
});

print(`[MongoDB Init] Created application user '${appUser}' for database '${dbName}'.`);
print('[MongoDB Init] Root credentials should NOT be used by the application.');
