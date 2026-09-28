type JsonSchema = Record<string, any>;
type OpenApiDocument = Record<string, any>;

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (schema: JsonSchema): JsonSchema => ({ type: 'array', items: schema });
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  ...(required.length ? { required } : {}),
  properties
});
const string = (extra: JsonSchema = {}): JsonSchema => ({ type: 'string', ...extra });
const integer = (extra: JsonSchema = {}): JsonSchema => ({ type: 'integer', ...extra });
const boolean = (extra: JsonSchema = {}): JsonSchema => ({ type: 'boolean', ...extra });

const permissionValues = [
  'orders', 'sports-pos', 'drink-intake', 'sports-intake', 'intake-history',
  'order-history', 'sports-order-history', 'revenue-report', 'courts', 'backup', 'rbac'
];

const schemas: Record<string, JsonSchema> = {
  ApiError: object({ code: string({ example: 'INVALID_INPUT' }), message: string({ example: 'Dữ liệu không hợp lệ' }) }, ['code', 'message']),
  Success: object({ ok: boolean({ example: true }), message: string() }, ['ok']),
  Health: object({ ok: boolean(), status: string(), service: string() }, ['ok', 'status', 'service']),
  Readiness: object({ ok: boolean(), status: string(), mongodb: string(), redis: string(), time: string({ format: 'date-time' }) }, ['ok', 'status']),
  LoginRequest: object({
    username: string({ minLength: 1, maxLength: 80, example: 'admin' }),
    password: string({ format: 'password', minLength: 1, maxLength: 256, example: 'admin123' }),
    authMode: string({ enum: ['bearer', 'cookie'], default: 'bearer', example: 'bearer' })
  }, ['username', 'password']),
  LoginResponse: object({
    success: boolean(), tokenType: string({ enum: ['cookie', 'Bearer'] }),
    accessToken: string(),
    expiresIn: integer({ example: 43200 }), expiresAt: string({ format: 'date-time' }),
    username: string(), roleId: string(), mustChangePassword: boolean()
  }, ['success', 'tokenType', 'expiresIn', 'expiresAt', 'username', 'roleId', 'mustChangePassword']),
  ChangePasswordRequest: object({ currentPassword: string({ format: 'password' }), newPassword: string({ format: 'password', minLength: 10, maxLength: 128 }) }, ['currentPassword', 'newPassword']),
  ActionProofRequest: object({ password: string({ format: 'password' }), action: string({ example: 'order.financial' }), resourceId: string({ maxLength: 120 }) }, ['password']),
  ActionProofResponse: object({ ok: boolean(), proofToken: string(), expiresAt: string({ format: 'date-time' }), message: string() }, ['ok', 'proofToken', 'expiresAt']),
  CustomerSession: object({
    sessionToken: string(),
    court: ref('Court'), expiresAt: string({ format: 'date-time' })
  }, ['sessionToken', 'court', 'expiresAt']),
  SessionInitRequest: object({ courtCode: string({ pattern: '^\\d{2,3}$', example: '01' }), sig: string({ minLength: 1, example: 'signed-qr-value' }) }, ['courtCode', 'sig']),
  CurrentSession: object({ court: ref('Court'), expiresAt: string({ format: 'date-time' }) }, ['court', 'expiresAt']),
  Court: object({ id: string(), courtId: string(), code: string({ pattern: '^\\d{2,3}$' }), name: string(), isActive: boolean(), sortOrder: integer(), qrVersion: integer({ minimum: 0 }), sig: string() }),
  CategoryInput: object({ name: string({ minLength: 1, maxLength: 60, example: 'Nước giải khát' }) }, ['name']),
  OrderItemInput: object({ productId: string(), quantity: integer({ minimum: 1, maximum: 1000 }), iceQuantity: integer({ minimum: 0, maximum: 1000, default: 0 }) }, ['productId', 'quantity']),
  PlaceOrderRequest: object({
    clientRequestId: string({ maxLength: 100 }), courtCode: string({ pattern: '^\\d{2,3}$' }),
    customerName: string({ maxLength: 100 }), customerPhone: string({ maxLength: 30 }),
    items: arrayOf(ref('OrderItemInput'))
  }, ['clientRequestId', 'items']),
  Order: object({
    orderId: string(), displayCode: string(), courtId: string(), courtName: string(), customerName: string(),
    orderType: string({ enum: ['drinks', 'sports_pos'] }), status: string({ enum: ['new', 'accepted', 'preparing', 'delivered', 'cancelled'] }),
    paymentStatus: string({ enum: ['unpaid', 'paid'] }), paymentMethod: string({ enum: ['cash', 'transfer'], nullable: true }),
    totalVnd: integer({ minimum: 0 }), items: arrayOf({ type: 'object', additionalProperties: true }), createdAt: string({ format: 'date-time' })
  }, ['orderId', 'displayCode', 'status', 'totalVnd', 'items', 'createdAt']),
  PaymentRequest: object({ paymentStatus: string({ enum: ['paid', 'unpaid'] }), paymentMethod: string({ enum: ['cash', 'transfer'] }), reason: string({ maxLength: 300 }) }, ['paymentStatus']),
  TransitionRequest: object({ targetStatus: string({ enum: ['preparing', 'delivered'] }) }, ['targetStatus']),
  CancelRequest: object({ reason: string({ minLength: 1, maxLength: 300 }) }, ['reason']),
  DrinkPosRequest: object({
    clientRequestId: string(), items: arrayOf(ref('OrderItemInput')),
    paymentStatus: string({ enum: ['paid', 'unpaid'] }), paymentMethod: string({ enum: ['cash', 'transfer'] }), courtId: string()
  }, ['clientRequestId', 'items']),
  ProductCreate: object({
    name: string({ minLength: 1, maxLength: 120 }), volume: string({ minLength: 1, maxLength: 40 }), unit: string({ maxLength: 30, default: 'Chai' }),
    category: string({ minLength: 1, maxLength: 60 }), costPriceVnd: integer({ minimum: 0, maximum: 100000000, default: 0 }),
    priceVnd: integer({ minimum: 1, maximum: 100000000 }), stock: integer({ minimum: 0, maximum: 1000000 }),
    minStockThreshold: integer({ minimum: 0, maximum: 100000, default: 5 }), tag: string({ maxLength: 40 }),
    imageSvg: string({ maxLength: 2000000 }), isAvailable: boolean({ default: true })
  }, ['name', 'volume', 'category', 'priceVnd', 'stock']),
  ProductPatch: object({
    name: string({ minLength: 1, maxLength: 120 }), volume: string({ minLength: 1, maxLength: 40 }), unit: string({ maxLength: 30 }),
    category: string({ minLength: 1, maxLength: 60 }), costPriceVnd: integer({ minimum: 0, maximum: 100000000 }),
    priceVnd: integer({ minimum: 1, maximum: 100000000 }), stock: integer({ minimum: 0, maximum: 1000000 }),
    minStockThreshold: integer({ minimum: 0, maximum: 100000 }), tag: string({ maxLength: 40 }), imageSvg: string({ maxLength: 2000000 }),
    isAvailable: boolean(), expectedStock: integer({ minimum: 0, maximum: 1000000 })
  }),
  StockAdjustment: object({
    clientRequestId: string(), delta: integer({ minimum: -1000000, maximum: 1000000 }), setAbsoluteStock: integer({ minimum: 0, maximum: 1000000 }),
    expectedStock: integer({ minimum: 0 }), costPriceVnd: integer({ minimum: 0 }), sellingPriceVnd: integer({ minimum: 0 }),
    responsiblePerson: string({ maxLength: 100 }), transferDate: string({ format: 'date-time' }), note: string({ maxLength: 200 }),
    reason: string({ enum: ['stock_intake', 'stock_adjustment', 'quick_restock'], default: 'stock_intake' })
  }, ['clientRequestId']),
  DrinkBatchIntake: object({
    clientRequestId: string(), items: arrayOf(object({ productId: string(), delta: integer({ minimum: 1, maximum: 1000000 }), costPriceVnd: integer({ minimum: 0 }), sellingPriceVnd: integer({ minimum: 0 }) }, ['productId', 'delta'])),
    transferDate: string({ format: 'date-time' }), responsiblePerson: string({ minLength: 1, maxLength: 100 }), note: string({ maxLength: 200 })
  }, ['clientRequestId', 'items', 'responsiblePerson']),
  CourtCreate: object({ code: string({ pattern: '^\\d{2,3}$', example: '01' }), name: string({ minLength: 1, maxLength: 100 }) }, ['code', 'name']),
  CourtPatch: object({ name: string({ minLength: 1, maxLength: 100 }), isActive: boolean(), rotateQr: boolean() }),
  SportsItemCreate: object({
    name: string({ minLength: 1, maxLength: 120 }), category: string({ minLength: 1, maxLength: 60 }), unit: string({ minLength: 1, maxLength: 30 }),
    costPriceVnd: integer({ minimum: 0, maximum: 100000000, default: 0 }), priceVnd: integer({ minimum: 0, maximum: 100000000 }),
    stock: integer({ minimum: 0, maximum: 1000000, default: 0 }), minStockThreshold: integer({ minimum: 0, maximum: 100000, default: 5 }),
    isService: boolean({ default: false }), isAvailable: boolean({ default: true }), imageSvg: string({ maxLength: 2000000 }), tag: string({ maxLength: 40 })
  }, ['name', 'category', 'unit', 'priceVnd']),
  SportsItemPatch: object({
    name: string({ minLength: 1, maxLength: 120 }), category: string({ minLength: 1, maxLength: 60 }), unit: string({ minLength: 1, maxLength: 30 }),
    costPriceVnd: integer({ minimum: 0, maximum: 100000000 }), priceVnd: integer({ minimum: 0, maximum: 100000000 }),
    minStockThreshold: integer({ minimum: 0, maximum: 100000 }), isService: boolean(), isAvailable: boolean(),
    imageSvg: string({ maxLength: 2000000, nullable: true }), tag: string({ maxLength: 40 })
  }),
  SportsStockAdjustment: object({ stock: integer({ minimum: 0, maximum: 1000000 }), costPriceVnd: integer({ minimum: 0 }), sellingPriceVnd: integer({ minimum: 0 }), responsiblePerson: string({ maxLength: 100 }), note: string({ maxLength: 200 }), expectedVersion: integer() }, ['stock']),
  SportsIntake: object({ clientRequestId: string(), itemId: string(), quantity: integer({ minimum: 1, maximum: 100000 }), costPriceVnd: integer({ minimum: 0 }), sellingPriceVnd: integer({ minimum: 0 }), responsiblePerson: string({ minLength: 1, maxLength: 100 }), transferDate: string({ format: 'date-time' }), note: string({ maxLength: 200 }) }, ['clientRequestId', 'itemId', 'quantity', 'costPriceVnd', 'responsiblePerson']),
  SportsBatchIntake: object({ clientRequestId: string(), items: arrayOf(object({ itemId: string(), quantity: integer({ minimum: 1, maximum: 100000 }), costPriceVnd: integer({ minimum: 0 }), sellingPriceVnd: integer({ minimum: 0 }) }, ['itemId', 'quantity'])), transferDate: string({ format: 'date-time' }), responsiblePerson: string({ minLength: 1, maxLength: 100 }), note: string({ maxLength: 200 }) }, ['clientRequestId', 'items', 'responsiblePerson']),
  SportsPosOrder: object({ clientRequestId: string(), courtId: string({ default: 'counter' }), courtNameSnapshot: string(), customerName: string({ maxLength: 100 }), customerPhone: string({ maxLength: 30 }), paymentMethod: string({ enum: ['cash', 'transfer'], default: 'cash' }), note: string({ maxLength: 200 }), items: arrayOf(object({ itemId: string(), quantity: integer({ minimum: 1, maximum: 1000 }), priceVnd: integer({ minimum: 0 }) }, ['itemId', 'quantity'])) }, ['clientRequestId', 'items']),
  SettingsUpdate: object({ isAcceptingOrders: boolean() }, ['isAcceptingOrders']),
  PurgeRequest: object({ startDate: string({ format: 'date' }), endDate: string({ format: 'date' }), beforeDate: string({ format: 'date' }), days: string(), customDate: string({ format: 'date' }), includeOrders: boolean({ default: true }), includeInventory: boolean({ default: true }), includeAuditLogs: boolean({ default: true }) }),
  RoleInput: object({ name: string({ minLength: 2, maxLength: 50 }), description: string({ maxLength: 200 }), permissions: arrayOf(string({ enum: permissionValues })) }, ['name', 'permissions']),
  UserCreate: object({ username: string({ minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_-]+$' }), fullName: string({ minLength: 2, maxLength: 80 }), password: string({ format: 'password', minLength: 10, maxLength: 128 }), roleId: string() }, ['username', 'fullName', 'password', 'roleId']),
  UserUpdate: object({ fullName: string({ minLength: 2, maxLength: 80 }), roleId: string(), isActive: boolean() }, ['fullName', 'roleId', 'isActive']),
  PasswordReset: object({ newPassword: string({ format: 'password', minLength: 10, maxLength: 128 }) }, ['newPassword']),
  CatalogImport: { type: 'object', additionalProperties: true },
  GenericObject: { type: 'object', additionalProperties: true }
};

const requestSchemas: Record<string, string> = {
  'POST /api/sessions/init': 'SessionInitRequest',
  'POST /api/orders': 'PlaceOrderRequest',
  'POST /api/admin/auth/login': 'LoginRequest',
  'POST /api/admin/auth/change-password': 'ChangePasswordRequest',
  'POST /api/admin/auth/verify-action-password': 'ActionProofRequest',
  'PATCH /api/admin/settings': 'SettingsUpdate',
  'POST /api/admin/categories': 'CategoryInput', 'PUT /api/admin/categories/{id}': 'CategoryInput',
  'POST /api/admin/orders/{id}/payment': 'PaymentRequest', 'POST /api/admin/orders/{id}/transition': 'TransitionRequest',
  'POST /api/admin/orders/{id}/deliver-and-pay': 'PaymentRequest', 'POST /api/admin/orders/{id}/cancel': 'CancelRequest',
  'POST /api/admin/orders/create-pos': 'DrinkPosRequest', 'POST /api/admin/orders/create-for-court': 'PlaceOrderRequest',
  'POST /api/admin/products': 'ProductCreate', 'PATCH /api/admin/products/{id}': 'ProductPatch',
  'POST /api/admin/products/{id}/stock': 'StockAdjustment', 'POST /api/admin/inventory/batch-intake': 'DrinkBatchIntake',
  'POST /api/admin/courts': 'CourtCreate', 'PATCH /api/admin/courts/{id}': 'CourtPatch',
  'POST /api/admin/sports/categories': 'CategoryInput', 'PUT /api/admin/sports/categories/{id}': 'CategoryInput',
  'POST /api/admin/sports/items': 'SportsItemCreate', 'PUT /api/admin/sports/items/{id}': 'SportsItemPatch',
  'POST /api/admin/sports/items/{id}/adjust-stock': 'SportsStockAdjustment', 'POST /api/admin/sports/intake': 'SportsIntake',
  'POST /api/admin/sports/batch-intake': 'SportsBatchIntake', 'POST /api/admin/sports/pos/order': 'SportsPosOrder',
  'POST /api/admin/clean/purge': 'PurgeRequest', 'POST /api/admin/catalog/import': 'CatalogImport',
  'POST /api/admin/rbac/roles': 'RoleInput', 'PUT /api/admin/rbac/roles/{roleId}': 'RoleInput',
  'POST /api/admin/rbac/users': 'UserCreate', 'PUT /api/admin/rbac/users/{userId}': 'UserUpdate',
  'PUT /api/admin/rbac/users/{userId}/password': 'PasswordReset'
};

const responseSchemas: Record<string, JsonSchema> = {
  'GET /api/health': ref('Health'), 'GET /api/health/ready': ref('Readiness'),
  'POST /api/sessions/init': ref('CustomerSession'), 'GET /api/sessions/current': ref('CurrentSession'),
  'GET /api/orders/my': arrayOf(ref('Order')), 'POST /api/orders': ref('Order'),
  'POST /api/admin/auth/login': ref('LoginResponse'), 'POST /api/admin/auth/verify-action-password': ref('ActionProofResponse'),
  'GET /api/admin/orders/active': arrayOf(ref('Order')), 'POST /api/admin/orders/{id}/payment': ref('Order'),
  'POST /api/admin/orders/{id}/transition': ref('Order'), 'POST /api/admin/orders/{id}/deliver-and-pay': ref('Order'),
  'POST /api/admin/orders/{id}/cancel': ref('Order'), 'POST /api/admin/orders/create-pos': ref('Order'),
  'POST /api/admin/orders/create-for-court': ref('Order'), 'GET /api/admin/courts': arrayOf(ref('Court'))
};

const actionProofs: Record<string, string> = {
  'PATCH /api/admin/settings': 'settings',
  'POST /api/admin/categories': 'drink.category', 'PUT /api/admin/categories/{id}': 'drink.category', 'DELETE /api/admin/categories/{id}': 'drink.category',
  'POST /api/admin/orders/{id}/payment': 'order.financial', 'POST /api/admin/orders/{id}/transition': 'order.transition',
  'POST /api/admin/orders/{id}/deliver-and-pay': 'order.financial', 'POST /api/admin/orders/{id}/cancel': 'order.financial',
  'POST /api/admin/orders/create-pos': 'order.pos', 'POST /api/admin/orders/create-for-court': 'order.pos',
  'POST /api/admin/products': 'inventory', 'PATCH /api/admin/products/{id}': 'inventory', 'DELETE /api/admin/products/{id}': 'inventory',
  'POST /api/admin/products/{id}/stock': 'inventory', 'POST /api/admin/inventory/batch-intake': 'inventory',
  'POST /api/admin/courts': 'courts.manage', 'PATCH /api/admin/courts/{id}': 'courts.manage', 'DELETE /api/admin/courts/{id}': 'courts.manage',
  'POST /api/admin/sports/categories': 'sports.category', 'PUT /api/admin/sports/categories/{id}': 'sports.category', 'DELETE /api/admin/sports/categories/{id}': 'sports.category',
  'POST /api/admin/sports/items': 'inventory', 'PUT /api/admin/sports/items/{id}': 'inventory', 'DELETE /api/admin/sports/items/{id}': 'inventory',
  'POST /api/admin/sports/items/{id}/adjust-stock': 'inventory', 'POST /api/admin/sports/intake': 'inventory', 'POST /api/admin/sports/batch-intake': 'inventory',
  'POST /api/admin/sports/pos/order': 'sports.pos', 'POST /api/admin/catalog/import': 'catalog.import', 'POST /api/admin/backup/full': 'backup.export', 'POST /api/admin/clean/purge': 'data.purge',
  'POST /api/admin/rbac/roles': 'rbac.manage', 'PUT /api/admin/rbac/roles/{roleId}': 'rbac.manage', 'DELETE /api/admin/rbac/roles/{roleId}': 'rbac.manage',
  'POST /api/admin/rbac/users': 'rbac.manage', 'PUT /api/admin/rbac/users/{userId}': 'rbac.manage', 'PUT /api/admin/rbac/users/{userId}/password': 'rbac.manage', 'DELETE /api/admin/rbac/users/{userId}': 'rbac.manage'
};

const queryParameters: Record<string, JsonSchema[]> = {
  'GET /api/catalog': [
    { name: 'court_code', in: 'query', schema: string({ pattern: '^\\d{2,3}$' }) },
    { name: 'sig', in: 'query', schema: string(), description: 'Chữ ký QR; không cần nếu đã có x-customer-session.' }
  ],
  'GET /api/admin/reports/summary': [
    { name: 'timeFilter', in: 'query', schema: string({ enum: ['today', 'yesterday', '7days', 'month', 'all'], default: 'today' }) },
    { name: 'categoryFilter', in: 'query', schema: string({ enum: ['all', 'drinks', 'sports', 'service'], default: 'all' }) }
  ],
  'GET /api/admin/reports/history': [
    { name: 'courtId', in: 'query', schema: string() }, { name: 'status', in: 'query', schema: string() },
    { name: 'paymentStatus', in: 'query', schema: string({ enum: ['all', 'unpaid', 'paid'] }) },
    { name: 'paymentMethod', in: 'query', schema: string({ enum: ['all', 'cash', 'transfer'] }) },
    { name: 'orderType', in: 'query', schema: string({ enum: ['all', 'drinks', 'sports_pos'], default: 'all' }) },
    { name: 'timePreset', in: 'query', schema: string({ enum: ['today', 'yesterday', '7days', 'month'] }) },
    { name: 'startDate', in: 'query', schema: string({ format: 'date' }) }, { name: 'endDate', in: 'query', schema: string({ format: 'date' }) },
    { name: 'search', in: 'query', schema: string() }, { name: 'limit', in: 'query', schema: integer({ minimum: 1, maximum: 200, default: 100 }) },
    { name: 'page', in: 'query', schema: integer({ minimum: 1 }) }, { name: 'cursor', in: 'query', schema: string() }
  ],
  'DELETE /api/admin/categories/{id}': [
    { name: 'moveTo', in: 'query', schema: string(), description: 'Danh mục đích khi vẫn còn sản phẩm.' },
    { name: 'cascadeDelete', in: 'query', schema: boolean({ default: false }) }
  ],
  'DELETE /api/admin/sports/categories/{id}': [
    { name: 'moveTo', in: 'query', schema: string(), description: 'Danh mục đích khi vẫn còn mặt hàng.' },
    { name: 'cascadeDelete', in: 'query', schema: boolean({ default: false }) }
  ],
  'GET /api/admin/sports/items': [
    { name: 'search', in: 'query', schema: string() }, { name: 'category', in: 'query', schema: string() },
    { name: 'type', in: 'query', schema: string({ enum: ['product', 'service'] }) }
  ],
  'GET /api/admin/inventory/intake-history': [
    { name: 'page', in: 'query', schema: integer({ minimum: 1, default: 1 }) },
    { name: 'limit', in: 'query', schema: integer({ minimum: 1, maximum: 500, default: 50 }) },
    { name: 'productId', in: 'query', schema: string() }, { name: 'timePreset', in: 'query', schema: string() },
    { name: 'search', in: 'query', schema: string() }
  ],
  'GET /api/admin/sports/intake-history': [
    { name: 'page', in: 'query', schema: integer({ minimum: 1, default: 1 }) },
    { name: 'limit', in: 'query', schema: integer({ minimum: 1, maximum: 200, default: 50 }) },
    { name: 'timePreset', in: 'query', schema: string() }, { name: 'search', in: 'query', schema: string() },
    { name: 'itemId', in: 'query', schema: string() }
  ],
  'GET /api/admin/audit-logs': [
    { name: 'page', in: 'query', schema: integer({ minimum: 1, default: 1 }) },
    { name: 'limit', in: 'query', schema: integer({ minimum: 1, maximum: 100, default: 15 }) }
  ],
  'GET /api/admin/clean/preview': [
    { name: 'startDate', in: 'query', schema: string({ format: 'date' }) }, { name: 'endDate', in: 'query', schema: string({ format: 'date' }) },
    { name: 'beforeDate', in: 'query', schema: string({ format: 'date' }) }, { name: 'days', in: 'query', schema: string() },
    { name: 'customDate', in: 'query', schema: string({ format: 'date' }) }
  ]
};

const standardErrors: Record<string, any> = {
  400: { description: 'Dữ liệu đầu vào không hợp lệ', content: { 'application/json': { schema: ref('ApiError') } } },
  401: { description: 'Chưa đăng nhập hoặc token hết hạn', content: { 'application/json': { schema: ref('ApiError') } } },
  403: { description: 'Không đủ quyền hoặc Action Proof không hợp lệ', content: { 'application/json': { schema: ref('ApiError') } } },
  404: { description: 'Không tìm thấy tài nguyên', content: { 'application/json': { schema: ref('ApiError') } } },
  409: { description: 'Xung đột dữ liệu hoặc idempotency key', content: { 'application/json': { schema: ref('ApiError') } } },
  429: { description: 'Vượt giới hạn tần suất', content: { 'application/json': { schema: ref('ApiError') } } },
  500: { description: 'Lỗi máy chủ', content: { 'application/json': { schema: ref('ApiError') } } }
};

function operationId(method: string, path: string): string {
  return `${method}_${path.replace(/^\//, '').replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

export function enrichOpenApiSpec(document: OpenApiDocument): OpenApiDocument {
  document.info.description = '';
  document.servers = [
    { url: 'http://localhost:3000', description: 'Local Server' }
  ];
  document.components = document.components || {};
  document.components.schemas = schemas;
  document.components.securitySchemes = {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Token', description: 'Token đăng nhập quản trị (lấy từ POST /api/admin/auth/login)' },
    customerSession: { type: 'apiKey', in: 'header', name: 'x-customer-session', description: 'Phiên khách đặt nước (lấy từ POST /api/sessions/init)' },
    cookieAuth: { type: 'apiKey', in: 'cookie', name: 'tl_admin', description: 'Cookie quản trị' },
    healthToken: { type: 'apiKey', in: 'header', name: 'x-health-token', description: 'Token kiểm tra hệ thống' }
  };

  const publicKeys = new Set(['GET /api/health', 'GET /api/health/ready', 'GET /api-docs', 'GET /api-docs/openapi.json', 'POST /api/admin/auth/login', 'POST /api/sessions/init']);
  const customerKeys = new Set(['GET /api/sessions/current', 'POST /api/sessions/terminate', 'GET /api/orders/my', 'POST /api/orders']);

  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    for (const [method, rawOperation] of Object.entries(pathItem as Record<string, any>)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const op = rawOperation as Record<string, any>;
      const key = `${method.toUpperCase()} ${path}`;
      op.operationId = operationId(method, path);

      if (key === 'GET /api/health/ready') op.security = [{ healthToken: [] }];
      else if (customerKeys.has(key)) op.security = [{ customerSession: [] }];
      else if (key === 'GET /api/catalog') op.security = [{ customerSession: [] }, {}];
      else if (publicKeys.has(key)) op.security = [];
      else if (path.startsWith('/api/admin')) op.security = [{ bearerAuth: [] }, { cookieAuth: [] }];

      const bodySchema = requestSchemas[key];
      if (bodySchema) {
        op.requestBody = { required: true, content: { 'application/json': { schema: ref(bodySchema) } } };
      }

      if (queryParameters[key]) {
        const existing = (op.parameters || []).filter((parameter: any) => parameter.in !== 'query');
        op.parameters = [...existing, ...queryParameters[key]];
      }

      const proofAction = actionProofs[key];
      if (proofAction) {
        const params = op.parameters || [];
        const withoutOldProof = params.filter((parameter: any) => !(parameter.in === 'header' && parameter.name?.toLowerCase() === 'x-action-proof'));
        op.parameters = [...withoutOldProof, {
          name: 'x-action-proof', in: 'header', required: true, schema: string(),
          description: `proofToken dùng một lần, lấy từ verify-action-password với action="${proofAction}".`
        }];
        op['x-action-proof'] = proofAction;
      }

      op.responses = op.responses || {};
      const successCode = op.responses['200'] ? '200' : (op.responses['201'] ? '201' : Object.keys(op.responses)[0]);
      if (successCode) {
        const success = op.responses[successCode];
        const schema = responseSchemas[key] || ref('GenericObject');
        success.content = success.content || { 'application/json': { schema } };
      }
      op.responses['500'] = op.responses['500'] || standardErrors['500'];
      if (bodySchema || op.parameters?.some((parameter: any) => parameter.in === 'query')) op.responses['400'] = op.responses['400'] || standardErrors['400'];
      if (path.startsWith('/api/admin') && key !== 'POST /api/admin/auth/login') {
        op.responses['401'] = op.responses['401'] || standardErrors['401'];
        op.responses['403'] = op.responses['403'] || standardErrors['403'];
      }
      if (path.includes('{')) op.responses['404'] = op.responses['404'] || standardErrors['404'];
      if (['post', 'put', 'patch', 'delete'].includes(method)) op.responses['409'] = op.responses['409'] || standardErrors['409'];
      if (path.includes('/auth/login') || path.startsWith('/api/sessions') || key === 'POST /api/orders' || key === 'POST /api/admin/catalog/import') {
        op.responses['429'] = op.responses['429'] || standardErrors['429'];
      }
    }
  }

  return document;
}
