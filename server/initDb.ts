import { connectToDatabase, getCollections, DB_NAME } from './db';
import { MOCK_PRODUCTS } from '../src/data/mockProducts';

export async function initDatabase(): Promise<void> {
  const { db } = await connectToDatabase();
  const colls = getCollections(db);

  console.log(`[InitDB] Checking seed state for database: ${DB_NAME}`);

  // 1. Seed Courts if empty (BR-01: 16 courts Sân 01..Sân 16)
  const courtCount = await colls.courts.countDocuments();
  if (courtCount === 0) {
    console.log('[InitDB] Seeding initial 16 courts...');
    const courtsToInsert = Array.from({ length: 16 }, (_, i) => {
      const code = (i + 1).toString().padStart(2, '0');
      return {
        courtId: `court-uuid-${code}`,
        code,
        name: `Sân ${code}`,
        sortOrder: i + 1,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    await colls.courts.insertMany(courtsToInsert);
    console.log('[InitDB] 16 courts seeded successfully.');
  } else {
    console.log(`[InitDB] Courts already exist (${courtCount} courts). Skipping court seeding.`);
  }

  // 2. Check Seed Marker for Products (BR-27: Never re-seed products deleted by user)
  const seedMarker = await colls.appSettings.findOne({ key: 'initial_seed_completed' });
  if (!seedMarker) {
    console.log('[InitDB] First-time run: Seeding 6 initial products...');
    const productsToInsert = MOCK_PRODUCTS.map(p => ({
      productId: p.id,
      name: p.name,
      volume: p.volume,
      category: p.category,
      priceVnd: p.priceVnd,
      stock: p.stock,
      imageSvg: p.imageSvg,
      tag: p.tag,
      isAvailable: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    }));
    await colls.products.insertMany(productsToInsert);

    // Set initial system settings
    await colls.appSettings.updateOne(
      { key: 'system_config' },
      {
        $set: {
          key: 'system_config',
          value: {
            isAcceptingOrders: true,
            chimeIntervalSeconds: 5,
            editWindowSeconds: 60
          },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Mark initial seed as completed
    await colls.appSettings.updateOne(
      { key: 'initial_seed_completed' },
      {
        $set: {
          key: 'initial_seed_completed',
          value: { completedAt: new Date() },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('[InitDB] Initial 6 products & system settings seeded successfully.');
  } else {
    console.log('[InitDB] Initial seed already completed previously. Preserving user catalog state.');
  }
}

// Allow direct execution: npx tsx server/initDb.ts
if (process.argv[1] && process.argv[1].includes('initDb')) {
  initDatabase()
    .then(() => {
      console.log('[InitDB] Complete. Exiting.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[InitDB] Error initializing DB:', err);
      process.exit(1);
    });
}
