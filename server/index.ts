import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToDatabase } from './db';
import { initDatabase } from './initDb';
import { catalogRouter } from './routes/catalogRoutes';
import { orderRouter } from './routes/orderRoutes';
import { adminRouter } from './routes/adminRoutes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// API Routes
app.use('/api/catalog', catalogRouter);
app.use('/api/orders', orderRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), db: 'tran_luu_order', env: IS_PROD ? 'production' : 'development' });
});

// ===== Serve Frontend in Production =====
if (IS_PROD) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // SPA fallback: tất cả routes không phải /api đều trả về index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

async function startServer() {
  try {
    await connectToDatabase();
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`[Backend] Trần Lựu Order API running on http://localhost:${PORT}`);
      if (IS_PROD) {
        console.log(`[Frontend] Serving React app from /dist`);
      }
    });
  } catch (err) {
    console.error('[Backend] Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
