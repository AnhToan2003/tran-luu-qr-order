import { Db, MongoClient } from 'mongodb';
import { getCollections, connectToDatabase, DB_NAME } from './db.js';
import { hashPassword } from './auth.js';
import type { RoleDoc, AdminUserDoc } from './types.js';

// SVG representations of authentic Vietnamese badminton drinks
const lavieSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="lavieBottle" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23CBE9F9"/>
      <stop offset="35%" stop-color="%23E7F5FD"/>
      <stop offset="70%" stop-color="%23BFE2F7"/>
      <stop offset="100%" stop-color="%239FD2F3"/>
    </linearGradient>
    <linearGradient id="lavieCap" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%230263B3"/>
      <stop offset="50%" stop-color="%232A90E2"/>
      <stop offset="100%" stop-color="%23014B88"/>
    </linearGradient>
  </defs>
  <rect x="85" y="24" width="30" height="22" rx="4" fill="url(%23lavieCap)"/>
  <path d="M82 46 L118 46 L124 85 L76 85 Z" fill="url(%23lavieBottle)"/>
  <rect x="66" y="85" width="68" height="145" rx="14" fill="url(%23lavieBottle)"/>
  <path d="M66 125 Q74 140 66 155 L66 85 Z" fill="%23A8D7F5"/>
  <path d="M134 125 Q126 140 134 155 L134 85 Z" fill="%2394CEF1"/>
  <rect x="66" y="115" width="68" height="60" fill="%23FFFFFF" rx="3"/>
  <circle cx="100" cy="132" r="9" fill="%23E2231A"/>
  <text x="100" y="156" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="%2301549C" text-anchor="middle">LaVie</text>
  <text x="100" y="167" font-family="Arial, sans-serif" font-weight="600" font-size="7" fill="%2301549C" text-anchor="middle">500ml</text>
  <path d="M67 195 Q85 190 100 195 T133 195 L133 220 Q100 232 67 220 Z" fill="%2390CBF0" opacity="0.6"/>
</svg>`;

const pocariSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="pocariBottle" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23E0EDF8"/>
      <stop offset="50%" stop-color="%23F3F8FD"/>
      <stop offset="100%" stop-color="%23C8DEF2"/>
    </linearGradient>
    <linearGradient id="pocariCap" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23035AA6"/>
      <stop offset="50%" stop-color="%230477D8"/>
      <stop offset="100%" stop-color="%23023E73"/>
    </linearGradient>
  </defs>
  <rect x="85" y="24" width="30" height="22" rx="4" fill="url(%23pocariCap)"/>
  <path d="M83 46 L117 46 L124 82 L76 82 Z" fill="url(%23pocariBottle)"/>
  <rect x="66" y="82" width="68" height="150" rx="14" fill="url(%23pocariBottle)"/>
  <rect x="66" y="98" width="68" height="88" fill="%230055A5" rx="3"/>
  <path d="M66 122 Q85 110 105 130 T134 122 L134 136 Q115 146 95 126 T66 136 Z" fill="%23FFFFFF"/>
  <text x="100" y="152" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="%23FFFFFF" text-anchor="middle" letter-spacing="1">POCARI</text>
  <text x="100" y="165" font-family="Arial, sans-serif" font-weight="800" font-size="9" fill="%23FFFFFF" text-anchor="middle" letter-spacing="1">SWEAT</text>
  <text x="100" y="178" font-family="Arial, sans-serif" font-weight="600" font-size="7" fill="%23D5EF76" text-anchor="middle">ION SUPPLY</text>
</svg>`;

const reviveSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="reviveBottle" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23F3FAE1"/>
      <stop offset="50%" stop-color="%23FCFFF5"/>
      <stop offset="100%" stop-color="%23E2F4B8"/>
    </linearGradient>
    <linearGradient id="reviveCap" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%2384CC16"/>
      <stop offset="50%" stop-color="%23A3E635"/>
      <stop offset="100%" stop-color="%2365A30D"/>
    </linearGradient>
  </defs>
  <rect x="85" y="24" width="30" height="22" rx="4" fill="url(%23reviveCap)"/>
  <path d="M82 46 L118 46 L125 84 L75 84 Z" fill="url(%23reviveBottle)"/>
  <rect x="66" y="84" width="68" height="148" rx="14" fill="url(%23reviveBottle)"/>
  <rect x="66" y="104" width="68" height="82" fill="%23A3E635" rx="3"/>
  <rect x="66" y="112" width="68" height="66" fill="%231E3A8A"/>
  <text x="100" y="136" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="%23FFFFFF" text-anchor="middle" font-style="italic">REVIVE</text>
  <circle cx="100" cy="153" r="10" fill="%23FACC15" stroke="%23FFFFFF" stroke-width="2"/>
  <text x="100" y="157" font-family="Arial, sans-serif" font-weight="900" font-size="8" fill="%231E3A8A" text-anchor="middle">MUỐI</text>
  <text x="100" y="172" font-family="Arial, sans-serif" font-weight="700" font-size="7" fill="%23FACC15" text-anchor="middle">BÙ KHOÁNG</text>
</svg>`;

const redBullSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="canTop" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23C4C4C4"/>
      <stop offset="50%" stop-color="%23EBEBEB"/>
      <stop offset="100%" stop-color="%239E9E9E"/>
    </linearGradient>
    <linearGradient id="goldBody" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23D4AF37"/>
      <stop offset="40%" stop-color="%23FBE790"/>
      <stop offset="80%" stop-color="%23C99700"/>
      <stop offset="100%" stop-color="%23996E00"/>
    </linearGradient>
  </defs>
  <rect x="68" y="55" width="64" height="14" rx="6" fill="url(%23canTop)"/>
  <rect x="65" y="66" width="70" height="150" rx="8" fill="url(%23goldBody)"/>
  <path d="M65 85 L135 125 L135 175 L65 135 Z" fill="%230F3B82"/>
  <circle cx="100" cy="142" r="14" fill="%23D81E05"/>
  <text x="100" y="172" font-family="Arial, sans-serif" font-weight="900" font-size="11" fill="%23D81E05" text-anchor="middle">Red Bull</text>
  <text x="100" y="184" font-family="Arial, sans-serif" font-weight="800" font-size="8" fill="%230F3B82" text-anchor="middle">Krating Daeng</text>
  <text x="100" y="204" font-family="Arial, sans-serif" font-weight="600" font-size="7" fill="%23333333" text-anchor="middle">250ml • Thái</text>
</svg>`;

const traXanhSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="traXanhBottle" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%238DC63F"/>
      <stop offset="50%" stop-color="%23BAE277"/>
      <stop offset="100%" stop-color="%23689F18"/>
    </linearGradient>
    <linearGradient id="traXanhCap" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%232D6A2A"/>
      <stop offset="50%" stop-color="%23459A41"/>
      <stop offset="100%" stop-color="%231E4A1C"/>
    </linearGradient>
  </defs>
  <rect x="85" y="24" width="30" height="22" rx="4" fill="url(%23traXanhCap)"/>
  <path d="M83 46 L117 46 L124 82 L76 82 Z" fill="url(%23traXanhBottle)"/>
  <rect x="66" y="82" width="68" height="150" rx="14" fill="url(%23traXanhBottle)"/>
  <rect x="66" y="104" width="68" height="82" fill="%23FEE500" rx="3"/>
  <rect x="66" y="112" width="68" height="30" fill="%232D6A2A"/>
  <text x="100" y="127" font-family="Arial, sans-serif" font-weight="900" font-size="9" fill="%23FFFFFF" text-anchor="middle">TRÀ XANH</text>
  <text x="100" y="137" font-family="Arial, sans-serif" font-weight="900" font-size="11" fill="%23FEE500" text-anchor="middle">KHÔNG ĐỘ</text>
  <circle cx="100" cy="158" r="12" fill="%23E2231A"/>
  <text x="96" y="163" font-family="Arial, sans-serif" font-weight="900" font-size="13" fill="%23FFFFFF" text-anchor="middle">0</text>
  <text x="106" y="156" font-family="Arial, sans-serif" font-weight="900" font-size="8" fill="%23FFFFFF" text-anchor="middle">°</text>
  <text x="100" y="180" font-family="Arial, sans-serif" font-weight="700" font-size="7" fill="%232D6A2A" text-anchor="middle">Ít đường • 455ml</text>
</svg>`;

const highlandsSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="canRimHighlands" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%23C4C4C4"/>
      <stop offset="50%" stop-color="%23EEEEEE"/>
      <stop offset="100%" stop-color="%239E9E9E"/>
    </linearGradient>
    <linearGradient id="highlandsBody" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="%238B0000"/>
      <stop offset="40%" stop-color="%23B31B1B"/>
      <stop offset="80%" stop-color="%23780000"/>
      <stop offset="100%" stop-color="%234A0000"/>
    </linearGradient>
  </defs>
  <rect x="70" y="58" width="60" height="14" rx="6" fill="url(%23canRimHighlands)"/>
  <rect x="67" y="70" width="66" height="144" rx="8" fill="url(%23highlandsBody)"/>
  <ellipse cx="100" cy="118" rx="26" ry="20" fill="%23FFFFFF"/>
  <ellipse cx="100" cy="118" rx="23" ry="17" fill="%23B31B1B"/>
  <text x="100" y="116" font-family="Arial, sans-serif" font-weight="900" font-size="7" fill="%23FFFFFF" text-anchor="middle" letter-spacing="1">HIGHLANDS</text>
  <text x="100" y="125" font-family="Arial, sans-serif" font-weight="800" font-size="6" fill="%23F3D999" text-anchor="middle">COFFEE</text>
  <rect x="67" y="148" width="66" height="34" fill="%233A180E"/>
  <text x="100" y="162" font-family="Arial, sans-serif" font-weight="900" font-size="9" fill="%23FFFFFF" text-anchor="middle">CÀ PHÊ SỮA</text>
  <text x="100" y="174" font-family="Arial, sans-serif" font-weight="700" font-size="7" fill="%23F3D999" text-anchor="middle">ĐẬM ĐÀ • 235ml</text>
</svg>`;

export const SAMPLE_PRODUCTS = [
  {
    productId: 'prod-01',
    name: 'Nước khoáng LaVie',
    volume: '500ml',
    priceVnd: 10000,
    stock: 48,
    category: 'water' as const,
    tag: 'Bán chạy',
    imageSvg: lavieSvg,
    isAvailable: true,
    deletedAt: null
  },
  {
    productId: 'prod-02',
    name: 'Pocari Sweat Bù Nước',
    volume: '500ml',
    priceVnd: 20000,
    stock: 35,
    category: 'isotonic' as const,
    tag: 'Bù điện giải',
    imageSvg: pocariSvg,
    isAvailable: true,
    deletedAt: null
  },
  {
    productId: 'prod-03',
    name: 'Revive Chanh Muối',
    volume: '500ml',
    priceVnd: 15000,
    stock: 42,
    category: 'isotonic' as const,
    tag: 'Thể thao',
    imageSvg: reviveSvg,
    isAvailable: true,
    deletedAt: null
  },
  {
    productId: 'prod-04',
    name: 'Bò Húc Red Bull Thái',
    volume: '250ml',
    priceVnd: 18000,
    stock: 24,
    category: 'energy' as const,
    tag: 'Năng lượng',
    imageSvg: redBullSvg,
    isAvailable: true,
    deletedAt: null
  },
  {
    productId: 'prod-05',
    name: 'Trà Xanh Không Độ',
    volume: '455ml',
    priceVnd: 15000,
    stock: 30,
    category: 'tea' as const,
    tag: 'Thanh mát',
    imageSvg: traXanhSvg,
    isAvailable: true,
    deletedAt: null
  },
  {
    productId: 'prod-06',
    name: 'Highlands Cà Phê Sữa',
    volume: '235ml',
    priceVnd: 22000,
    stock: 18,
    category: 'coffee' as const,
    tag: 'Tỉnh táo',
    imageSvg: highlandsSvg,
    isAvailable: true,
    deletedAt: null
  }
];

export const SAMPLE_SPORTS_ITEMS = [
  {
    itemId: 'sport-vot-yonex-astrox88',
    name: 'Vợt Cầu Lông Yonex Astrox 88D Play',
    category: 'racket',
    unit: 'Cây',
    costPriceVnd: 1250000,
    priceVnd: 1650000,
    stock: 12,
    minStockThreshold: 3,
    isService: false,
    isAvailable: true,
    tag: 'Chính hãng'
  },
  {
    itemId: 'sport-vo-yonex-dai',
    name: 'Vớ Thể Thao Yonex Cổ Dài',
    category: 'sock_long',
    unit: 'Đôi',
    costPriceVnd: 35000,
    priceVnd: 65000,
    stock: 45,
    minStockThreshold: 10,
    isService: false,
    isAvailable: true,
    tag: 'Dày dặn'
  },
  {
    itemId: 'sport-vo-yonex-ngan',
    name: 'Vớ Thể Thao Cổ Ngắn Thoáng Khí',
    category: 'sock_short',
    unit: 'Đôi',
    costPriceVnd: 22000,
    priceVnd: 45000,
    stock: 60,
    minStockThreshold: 10,
    isService: false,
    isAvailable: true,
    tag: 'Thoáng mát'
  },
  {
    itemId: 'sport-quan-can-ac102',
    name: 'Quấn Cán Vợt Yonex AC102EX',
    category: 'grip',
    unit: 'Cái',
    costPriceVnd: 18000,
    priceVnd: 35000,
    stock: 80,
    minStockThreshold: 15,
    isService: false,
    isAvailable: true,
    tag: 'Bám tay'
  },
  {
    itemId: 'sport-cau-thanh-cong',
    name: 'Ống Cầu Lông Thành Công 77',
    category: 'shuttlecock',
    unit: 'Ống',
    costPriceVnd: 215000,
    priceVnd: 250000,
    stock: 25,
    minStockThreshold: 5,
    isService: false,
    isAvailable: true,
    tag: 'Bền bỉ'
  },
  {
    itemId: 'sport-service-dan-luoi',
    name: 'Dịch Vụ Đan Lưới Cước Vợt BG65Ti',
    category: 'service',
    unit: 'Cây',
    costPriceVnd: 40000,
    priceVnd: 130000,
    stock: 0,
    minStockThreshold: 0,
    isService: true,
    isAvailable: true,
    tag: 'Căng chuẩn kg'
  },
  {
    itemId: 'sport-service-thue-vot',
    name: 'Dịch Vụ Thuê Vợt Thi Đấu',
    category: 'service',
    unit: 'Cây/Buổi',
    costPriceVnd: 0,
    priceVnd: 30000,
    stock: 0,
    minStockThreshold: 0,
    isService: true,
    isAvailable: true,
    tag: 'Tại sân'
  },
  {
    itemId: 'sport-service-thue-giay',
    name: 'Dịch Vụ Thuê Giày Cầu Lông',
    category: 'service',
    unit: 'Đôi/Buổi',
    costPriceVnd: 0,
    priceVnd: 40000,
    stock: 0,
    minStockThreshold: 0,
    isService: true,
    isAvailable: true,
    tag: 'Size 38-44'
  }
];

export const SAMPLE_COURTS = Array.from({ length: 16 }, (_, i) => {
  const code = (i + 1).toString().padStart(2, '0');
  return {
    courtId: `court-uuid-${code}`,
    code,
    name: `Sân ${code}`,
    sortOrder: i + 1,
    isActive: true,
    deletedAt: null
  };
});

export async function seedSampleData(db: Db, force = false): Promise<{ courtsCount: number; productsCount: number }> {
  const now = new Date();
  const courtsCol = db.collection('courts');
  const productsCol = db.collection('products');
  const settingsCol = db.collection('app_settings');
  const sportsCol = db.collection('sports_items');
  const sportsMovCol = db.collection('sports_movements');

  console.log('[Seed] Seeding sample data for Sân Cầu Lông Trần Lựu...');

  // 1. Courts (16 courts)
  if (force) {
    await courtsCol.deleteMany({});
  }
  const existingCourts = await courtsCol.countDocuments();
  if (existingCourts === 0 || force) {
    const courtsToInsert = SAMPLE_COURTS.map(c => ({
      ...c,
      createdAt: now,
      updatedAt: now
    }));
    await courtsCol.insertMany(courtsToInsert);
    console.log(`[Seed] Seeded ${courtsToInsert.length} courts successfully (Sân 01 -> Sân 16).`);
  } else {
    console.log(`[Seed] Courts collection already has ${existingCourts} items. Skipping.`);
  }

  // 2. Products (from initial_catalog.json or SAMPLE_PRODUCTS)
  if (force) {
    await productsCol.deleteMany({});
  }
  const existingProducts = await productsCol.countDocuments();
  if (existingProducts === 0 || force) {
    let baseProducts: any[] = SAMPLE_PRODUCTS;
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const catalogFile = path.resolve('data/initial_catalog.json');
      if (fs.existsSync(catalogFile)) {
        const parsed = JSON.parse(fs.readFileSync(catalogFile, 'utf-8'));
        if (Array.isArray(parsed) && parsed.length > 0) {
          baseProducts = parsed;
          console.log(`[Seed] Loaded ${parsed.length} products from data/initial_catalog.json.`);
        }
      }
    } catch {
      // Fallback to SAMPLE_PRODUCTS
    }
    const productsToInsert = baseProducts.map((p: any) => ({
      ...p,
      version: p.version || 1,
      createdAt: p.createdAt ? new Date(p.createdAt) : now,
      updatedAt: now
    }));
    await productsCol.insertMany(productsToInsert);
    console.log(`[Seed] Seeded ${productsToInsert.length} products successfully.`);
  } else {
    console.log(`[Seed] Products collection already has ${existingProducts} items. Skipping.`);
  }

  // 3. System Config
  await settingsCol.updateOne(
    { key: 'system_config' },
    {
      $set: {
        key: 'system_config',
        'value.isAcceptingOrders': true,
        'value.chimeIntervalSeconds': 5,
        'value.editWindowSeconds': 60,
        updatedAt: now
      }
    },
    { upsert: true }
  );
  console.log('[Seed] System configuration initialized (Orders enabled, Chime 5s).');

  // 4. Sports Items & Services
  const existingSports = await sportsCol.countDocuments();
  if (existingSports === 0 || force) {
    if (force) {
      await sportsCol.deleteMany({});
      await sportsMovCol.deleteMany({});
    }
    let baseSports: any[] = SAMPLE_SPORTS_ITEMS;
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const sportsFile = path.resolve('data/initial_sports.json');
      if (fs.existsSync(sportsFile)) {
        const parsed = JSON.parse(fs.readFileSync(sportsFile, 'utf-8'));
        if (Array.isArray(parsed) && parsed.length > 0) {
          baseSports = parsed;
          console.log(`[Seed] Loaded ${parsed.length} sports items from data/initial_sports.json.`);
        }
      }
    } catch {
      // Fallback
    }

    const sportsToInsert = baseSports.map((s: any) => ({
      itemId: s.itemId,
      name: s.name,
      category: s.category,
      unit: s.unit,
      costPriceVnd: s.costPriceVnd,
      priceVnd: s.priceVnd,
      stock: s.isService ? 0 : s.stock,
      minStockThreshold: s.minStockThreshold || 5,
      isService: !!s.isService,
      isAvailable: s.isAvailable !== false,
      tag: s.tag || '',
      imageSvg: s.imageSvg || '',
      deletedAt: null,
      createdAt: s.createdAt ? new Date(s.createdAt) : now,
      updatedAt: now
    }));
    await sportsCol.insertMany(sportsToInsert);

    // Seed initial stock intake movements for items with initial stock
    const initialMovements = sportsToInsert
      .filter((s: any) => !s.isService && s.stock > 0)
      .map((s: any) => ({
        operationId: `mov-init-${s.itemId}`,
        itemId: s.itemId,
        itemNameSnapshot: s.name,
        unitSnapshot: s.unit,
        delta: s.stock,
        costPriceVnd: s.costPriceVnd,
        sellingPriceVnd: s.priceVnd,
        totalCostVnd: s.stock * s.costPriceVnd,
        stockAfter: s.stock,
        reason: 'stock_intake',
        note: 'Tồn kho ban đầu hệ thống',
        createdAt: now
      }));
    if (initialMovements.length > 0) {
      await sportsMovCol.insertMany(initialMovements);
    }
  } else {
    console.log(`[Seed] Sports collection already has ${existingSports} items. Skipping.`);
  }

  // Seed Default Roles & Users if empty
  const rolesCol = db.collection<RoleDoc>('roles');
  const usersCol = db.collection<AdminUserDoc>('admin_users');
  const existingRoles = await rolesCol.countDocuments();
  if (existingRoles === 0 || force) {
    if (force) await rolesCol.deleteMany({});
    const defaultRoles: RoleDoc[] = [
      {
        roleId: 'admin',
        name: 'Quản trị viên (Admin)',
        description: 'Toàn quyền truy cập tất cả chức năng trên hệ thống',
        permissions: ['orders', 'sports-pos', 'drink-intake', 'sports-intake', 'intake-history', 'order-history', 'revenue-report', 'settings'],
        isSystem: true,
        createdAt: now,
        updatedAt: now
      },
      {
        roleId: 'staff_water',
        name: 'Nhân viên Quầy Nước',
        description: 'Nhận đơn nước & giao nước tại sân, xem lịch sử đơn hàng',
        permissions: ['orders', 'drink-intake', 'order-history'],
        isSystem: true,
        createdAt: now,
        updatedAt: now
      },
      {
        roleId: 'staff_sports',
        name: 'Nhân viên Quầy Thể Thao',
        description: 'Bán hàng tại quầy thể thao & dịch vụ sân cầu lông',
        permissions: ['sports-pos', 'sports-intake'],
        isSystem: true,
        createdAt: now,
        updatedAt: now
      },
      {
        roleId: 'warehouse',
        name: 'Thủ kho & Nhập hàng',
        description: 'Quản lý tồn kho, nhập hàng nước và dụng cụ thể thao',
        permissions: ['drink-intake', 'sports-intake', 'intake-history'],
        isSystem: true,
        createdAt: now,
        updatedAt: now
      }
    ];
    await rolesCol.insertMany(defaultRoles);
    console.log(`[Seed] Seeded ${defaultRoles.length} default roles.`);
  }

  // Tách biệt khởi tạo tài khoản quản trị:
  // Tuyệt đối KHÔNG tự động tạo tài khoản mặc định với mật khẩu biết trước trong môi trường Production!
  const isProduction = process.env.NODE_ENV === 'production';
  const existingUsers = await usersCol.countDocuments();

  if (!isProduction && (existingUsers === 0 || force)) {
    if (force) await usersCol.deleteMany({});
    const defaultDevUser: AdminUserDoc = {
      userId: 'user-admin-dev',
      username: 'admin_dev',
      passwordHash: await hashPassword('admin123'),
      fullName: 'Quản Trị Viên Dev',
      roleId: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    await usersCol.insertOne(defaultDevUser);
    console.log('[Seed] Seeded dev admin account (admin_dev / admin123).');
  } else if (isProduction && existingUsers === 0) {
    console.log('[Security Notice] Môi trường Production không tự tạo tài khoản seed. Vui lòng cấu hình ADMIN_PASSWORD_HASH trong ENV hoặc sử dụng script bootstrap riêng.');
  }

  const finalCourts = await courtsCol.countDocuments();
  const finalProducts = await productsCol.countDocuments();
  return { courtsCount: finalCourts, productsCount: finalProducts };
}

/**
 * Hàm khởi tạo (bootstrap) tài khoản quản trị có chủ đích
 * Không tự động ghi đè tài khoản đã tồn tại nếu force=false
 */
export async function bootstrapAdminUser(
  db: Db,
  options: { username?: string; password?: string; fullName?: string; force?: boolean } = {}
): Promise<{ success: boolean; message: string; userId?: string }> {
  const usersCol = db.collection<AdminUserDoc>('admin_users');
  const targetUsername = (options.username || 'admin').trim().toLowerCase();
  const envAdminUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();

  if (targetUsername === envAdminUser) {
    throw new Error(`Tên tài khoản '${targetUsername}' trùng với tài khoản quản trị viên biến môi trường (ENV). Không được phép tạo trong cơ sở dữ liệu.`);
  }

  const existing = await usersCol.findOne({ username: targetUsername });

  if (existing && !options.force) {
    return { success: false, message: `Tài khoản '${targetUsername}' đã tồn tại trong cơ sở dữ liệu.` };
  }

  if (!options.password || options.password.length < 8) {
    throw new Error('Mật khẩu khởi tạo quản trị phải có độ dài tối thiểu 8 ký tự.');
  }

  const now = new Date();
  const userId = existing?.userId || `user-${Date.now().toString(36)}`;
  const userDoc: AdminUserDoc = {
    userId,
    username: targetUsername,
    passwordHash: await hashPassword(options.password),
    fullName: options.fullName || 'Quản Trị Viên Hệ Thống',
    roleId: 'admin',
    isActive: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await usersCol.updateOne({ username: targetUsername }, { $set: userDoc });
  } else {
    await usersCol.insertOne(userDoc);
  }

  return { success: true, message: `Khởi tạo tài khoản '${targetUsername}' thành công.`, userId };
}

// Standalone execution: npx tsx server/seedData.ts
if (process.argv[1] && process.argv[1].endsWith('seedData.ts')) {
  (async () => {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    console.log(`[Seed] Connecting to MongoDB: ${uri}`);
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.DB_NAME || DB_NAME);
    const force = process.argv.includes('--force');
    const result = await seedSampleData(db, force);
    console.log(`[Seed] Done! Courts: ${result.courtsCount}, Products: ${result.productsCount}`);
    await client.close();
    process.exit(0);
  })().catch(err => {
    console.error('[Seed] Error:', err);
    process.exit(1);
  });
}
