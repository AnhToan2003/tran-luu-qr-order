import { enrichOpenApiSpec } from './openapiContract.js';

const baseOpenapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Sân Cầu Lông Trần Lựu API',
    version: '2.0.0',
    description: ''
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local Server' }
  ],
  tags: [
    { name: 'Health & System', description: 'Kiểm tra trạng thái hệ thống' },
    { name: 'Customer Session', description: 'Phiên gọi nước tại sân' },
    { name: 'Customer Catalog', description: 'Danh mục sản phẩm đồ uống' },
    { name: 'Customer Orders', description: 'Đặt món và theo dõi đơn hàng' },
    { name: 'Admin Auth & Action Proof', description: 'Xác thực quản trị và Action Proof' },
    { name: 'Admin Drink Orders', description: 'Quản lý đơn nước và POS' },
    { name: 'Admin Drink Products & Categories', description: 'Sản phẩm nước và danh mục' },
    { name: 'Admin Courts', description: 'Quản lý sân cầu lông' },
    { name: 'Admin Sports Counter & POS', description: 'Bán hàng thể thao và dịch vụ' },
    { name: 'Admin Reports', description: 'Báo cáo doanh thu' },
    { name: 'Admin System Settings', description: 'Cấu hình hệ thống' },
    { name: 'Admin Data Purge & Catalog Backup', description: 'Dọn dẹp dữ liệu và sao lưu' },
    { name: 'Admin RBAC Management', description: 'Phân quyền và tài khoản' }
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'tl_admin',
        description: 'Session cookie (tl_admin)'
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        description: 'Bearer Token'
      }
    }
  },
  paths: {
    // ==========================================
    // 1. HEALTH & SYSTEM (4)
    // ==========================================
    '/api/health': {
      get: {
        tags: ['Health & System'],
        summary: 'Liveness Probe (Kiểm tra dịch vụ sống)',
        description: 'Kiểm tra siêu nhẹ không truy vấn database, phục vụ load balancer.',
        responses: {
          200: { description: 'Dịch vụ đang hoạt động bình thường' }
        }
      }
    },
    '/api/health/ready': {
      get: {
        tags: ['Health & System'],
        summary: 'Readiness Probe (Kiểm tra kết nối Mongo & Redis)',
        description: 'Chủ động ping MongoDB và Redis. Cho phép truy cập từ localhost hoặc có header x-health-token.',
        parameters: [
          { name: 'x-health-token', in: 'header', required: false, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Cơ sở dữ liệu và Cache sẵn sàng nhận tải' },
          503: { description: 'Database hoặc Redis gián đoạn' }
        }
      }
    },
    '/api-docs/openapi.json': {
      get: {
        tags: ['Health & System'],
        summary: 'Lấy định nghĩa OpenAPI Specification JSON',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'OpenAPI Spec JSON' }
        }
      }
    },
    '/api-docs': {
      get: {
        tags: ['Health & System'],
        summary: 'Giao diện Swagger UI',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Swagger UI HTML' }
        }
      }
    },

    // ==========================================
    // 2. CUSTOMER SESSIONS (3)
    // ==========================================
    '/api/sessions/init': {
      post: {
        tags: ['Customer Session'],
        summary: 'Khởi tạo phiên gọi nước khi quét mã QR',
        description: 'Xác thực chữ ký HMAC-SHA256 của mã sân chống can thiệp URL.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courtCode', 'sig'],
                properties: {
                  courtCode: { type: 'string', example: '01' },
                  sig: { type: 'string', example: '40e237dea12459bdd7f488aab82d33b3' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Khởi tạo phiên thành công, trả về sessionToken' },
          403: { description: 'Chữ ký QR không hợp lệ' }
        }
      }
    },
    '/api/sessions/current': {
      get: {
        tags: ['Customer Session'],
        summary: 'Xác thực trạng thái phiên khách hàng hiện tại',
        parameters: [
          { name: 'x-customer-session', in: 'header', required: false, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Thông tin phiên hợp lệ' },
          401: { description: 'Phiên không hợp lệ hoặc đã hết hạn' }
        }
      }
    },
    '/api/sessions/terminate': {
      post: {
        tags: ['Customer Session'],
        summary: 'Kết thúc phiên gọi nước hiện tại',
        parameters: [
          { name: 'x-customer-session', in: 'header', required: false, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Đã hủy phiên thành công' }
        }
      }
    },

    // ==========================================
    // 3. CUSTOMER CATALOG (1)
    // ==========================================
    '/api/catalog': {
      get: {
        tags: ['Customer Catalog'],
        summary: 'Lấy menu sản phẩm đồ uống công khai cho khách',
        responses: {
          200: { description: 'Danh sách sản phẩm còn hàng' }
        }
      }
    },

    // ==========================================
    // 4. CUSTOMER ORDERS (4)
    // ==========================================
    '/api/orders/my': {
      get: {
        tags: ['Customer Orders'],
        summary: 'Lấy lịch sử đơn hàng của chính phiên hiện tại',
        parameters: [
          { name: 'x-customer-session', in: 'header', required: false, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Danh sách đơn hàng của khách' }
        }
      }
    },
    '/api/orders': {
      post: {
        tags: ['Customer Orders'],
        summary: 'Khách gửi đơn gọi nước',
        description: 'Tự động trừ tồn kho nguyên tử (ACID Transaction) và phát thông báo WebSocket.',
        parameters: [
          { name: 'x-customer-session', in: 'header', required: false, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientRequestId', 'items'],
                properties: {
                  clientRequestId: { type: 'string', example: 'req-uuid-001' },
                  courtCode: { type: 'string', example: '01' },
                  customerName: { type: 'string', example: 'Khách sân 1' },
                  customerPhone: { type: 'string', example: '0901234567' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['productId', 'quantity'],
                      properties: {
                        productId: { type: 'string', example: 'tra_dao' },
                        quantity: { type: 'integer', minimum: 1, example: 2 },
                        iceQuantity: { type: 'integer', minimum: 0, example: 2 }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Đặt đơn thành công' },
          409: { description: 'Hết hàng hoặc quầy đang tạm dừng nhận đơn' }
        }
      }
    },
    '/api/orders/{id}/cancel': {
      post: {
        tags: ['Customer Orders'],
        summary: 'Khách yêu cầu hủy đơn (Bị vô hiệu hóa - yêu cầu liên hệ quầy)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          403: { description: 'Khách không được tự ý hủy đơn sau khi đã gửi quầy' }
        }
      }
    },
    '/api/orders/{id}': {
      patch: {
        tags: ['Customer Orders'],
        summary: 'Khách chỉnh sửa đơn (Bị vô hiệu hóa - yêu cầu liên hệ quầy)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          403: { description: 'Đơn đã gửi không thể chỉnh sửa' }
        }
      }
    },

    // ==========================================
    // 5. ADMIN AUTH & ACTION PROOF (5)
    // ==========================================
    '/api/admin/auth/login': {
      post: {
        tags: ['Admin Auth & Action Proof'],
        summary: 'Đăng nhập quản trị viên',
        description: 'Tạo phiên cookie cho web hoặc trả accessToken khi authMode=bearer.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', format: 'password', example: 'StrongPassphrase!2026' },
                  authMode: { type: 'string', enum: ['cookie', 'bearer'], default: 'cookie', example: 'bearer' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Đăng nhập thành công' },
          401: { description: 'Sai tài khoản hoặc mật khẩu' }
        }
      }
    },
    '/api/admin/auth/session': {
      get: {
        tags: ['Admin Auth & Action Proof'],
        summary: 'Lấy thông tin tài khoản và danh sách quyền hạn hiện tại',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Thông tin tài khoản' },
          401: { description: 'Chưa đăng nhập' }
        }
      }
    },
    '/api/admin/auth/change-password': {
      post: {
        tags: ['Admin Auth & Action Proof'],
        summary: 'Đổi mật khẩu tài khoản quản trị hiện tại',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Đổi mật khẩu thành công' }
        }
      }
    },
    '/api/admin/auth/logout': {
      post: {
        tags: ['Admin Auth & Action Proof'],
        summary: 'Đăng xuất khỏi hệ thống quản trị',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Đã hủy phiên đăng nhập' }
        }
      }
    },
    '/api/admin/auth/verify-action-password': {
      post: {
        tags: ['Admin Auth & Action Proof'],
        summary: 'Xác thực mật khẩu cấp Action Proof dùng cho thao tác nhạy cảm',
        description: 'Sinh token dùng 1 lần (TTL 5 phút) có ràng buộc loại action, dùng cho header x-action-proof.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  password: { type: 'string' },
                  action: { type: 'string', example: 'order.financial' },
                  resourceId: { type: 'string', nullable: true }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Trả về proofToken hợp lệ' }
        }
      }
    },

    // ==========================================
    // 6. ADMIN DRINK ORDERS (7)
    // ==========================================
    '/api/admin/orders/active': {
      get: {
        tags: ['Admin Drink Orders'],
        summary: 'Lấy danh sách các đơn nước đang hoạt động trong ngày',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Danh sách đơn đang xử lý' }
        }
      }
    },
    '/api/admin/orders/{id}/transition': {
      post: {
        tags: ['Admin Drink Orders'],
        summary: 'Chuyển trạng thái đơn nước (preparing -> delivered)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetStatus'],
                properties: {
                  targetStatus: { type: 'string', enum: ['preparing', 'delivered'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Chuyển trạng thái thành công' },
          403: { description: 'Yêu cầu Action Proof order.transition' }
        }
      }
    },
    '/api/admin/orders/{id}/payment': {
      post: {
        tags: ['Admin Drink Orders'],
        summary: 'Cập nhật trạng thái thanh toán (paid / unpaid)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paymentStatus'],
                properties: {
                  paymentStatus: { type: 'string', enum: ['paid', 'unpaid'] },
                  paymentMethod: { type: 'string', enum: ['cash', 'transfer'] },
                  reason: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Cập nhật thanh toán thành công' },
          403: { description: 'Yêu cầu Action Proof order.financial' }
        }
      }
    },
    '/api/admin/orders/{id}/deliver-and-pay': {
      post: {
        tags: ['Admin Drink Orders'],
        summary: 'Thao tác nhanh: Giao hàng và Thu tiền cùng lúc',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  paymentMethod: { type: 'string', enum: ['cash', 'transfer'], default: 'cash' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Đã hoàn tất giao và thu tiền' }
        }
      }
    },
    '/api/admin/orders/{id}/cancel': {
      post: {
        tags: ['Admin Drink Orders'],
        summary: 'Hủy đơn hàng và tự động hoàn trả tồn kho (Restock)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string', example: 'Khách báo hủy' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Đã hủy đơn và hoàn kho thành công' }
        }
      }
    },
    '/api/admin/orders/create-pos': {
      post: {
        tags: ['Admin Drink Orders'],
        summary: 'Tạo đơn bán trực tiếp tại quầy thu ngân (POS)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  courtCode: { type: 'string', nullable: true },
                  paymentMethod: { type: 'string', enum: ['cash', 'transfer'], default: 'cash' },
                  isPaid: { type: 'boolean', default: true },
                  items: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Đơn POS tạo thành công' }
        }
      }
    },
    '/api/admin/orders/create-for-court': {
      post: {
        tags: ['Admin Drink Orders'],
        summary: 'Nhân viên tạo đơn gọi nước thay khách theo số sân',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courtCode', 'items'],
                properties: {
                  courtCode: { type: 'string', example: '01' },
                  items: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Tạo đơn thành công cho sân' }
        }
      }
    },

    // ==========================================
    // 7. ADMIN DRINK PRODUCTS & CATEGORIES (12)
    // ==========================================
    '/api/admin/categories': {
      get: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Lấy danh sách các danh mục đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh mục nước' } }
      },
      post: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Tạo danh mục đồ uống mới',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'] } } } },
        responses: { 201: { description: 'Tạo danh mục thành công' } }
      }
    },
    '/api/admin/categories/{id}': {
      put: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Cập nhật danh mục đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật thành công' } }
      },
      delete: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Xóa danh mục đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa thành công' } }
      }
    },
    '/api/admin/products': {
      get: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Lấy danh sách đầy đủ sản phẩm đồ uống (kèm giá vốn và tồn kho)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách sản phẩm' } }
      },
      post: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Thêm sản phẩm đồ uống mới vào menu',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Thêm sản phẩm thành công' } }
      }
    },
    '/api/admin/products/{id}': {
      patch: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Cập nhật thông tin sản phẩm đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật sản phẩm thành công' } }
      },
      delete: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Xóa mềm sản phẩm đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa sản phẩm thành công' } }
      }
    },
    '/api/admin/products/{id}/movements': {
      get: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Xem lịch sử xuất nhập tồn (thẻ kho) của sản phẩm đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Lịch sử biến động tồn kho' } }
      }
    },
    '/api/admin/products/{id}/stock': {
      post: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Điều chỉnh số lượng tồn kho trực tiếp (Kiểm kê)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cân đối tồn kho thành công' } }
      }
    },
    '/api/admin/inventory/batch-intake': {
      post: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Nhập kho nhiều sản phẩm đồ uống theo lô hàng',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Nhập kho thành công' } }
      }
    },
    '/api/admin/inventory/intake-history': {
      get: {
        tags: ['Admin Drink Products & Categories'],
        summary: 'Lịch sử các đợt nhập hàng đồ uống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách phiếu nhập hàng' } }
      }
    },

    // ==========================================
    // 8. ADMIN COURTS (4)
    // ==========================================
    '/api/admin/courts': {
      get: {
        tags: ['Admin Courts'],
        summary: 'Lấy danh sách các sân cầu lông kèm link QR và chữ ký số',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách sân' } }
      },
      post: {
        tags: ['Admin Courts'],
        summary: 'Thêm sân cầu lông mới',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Tạo sân thành công' } }
      }
    },
    '/api/admin/courts/{id}': {
      patch: {
        tags: ['Admin Courts'],
        summary: 'Cập nhật sân hoặc luân phiên QR để thu hồi mã cũ',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật sân thành công' } }
      },
      delete: {
        tags: ['Admin Courts'],
        summary: 'Xóa sân cầu lông',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa sân thành công' } }
      }
    },

    // ==========================================
    // 9. ADMIN SPORTS COUNTER & POS (13)
    // ==========================================
    '/api/admin/sports/categories': {
      get: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Lấy danh mục mặt hàng thể thao và dịch vụ',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh mục thể thao' } }
      },
      post: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Tạo danh mục thể thao mới',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Tạo danh mục thành công' } }
      }
    },
    '/api/admin/sports/categories/{id}': {
      put: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Cập nhật danh mục thể thao',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật thành công' } }
      },
      delete: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Xóa danh mục thể thao',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa thành công' } }
      }
    },
    '/api/admin/sports/items': {
      get: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Lấy danh sách đồ thể thao & dịch vụ (Cầu lông, Quấn cán, Thuê vợt, Đan vợt)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách mặt hàng thể thao' } }
      },
      post: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Tạo sản phẩm thể thao hoặc dịch vụ sân mới',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Tạo mặt hàng thành công' } }
      }
    },
    '/api/admin/sports/items/{id}': {
      put: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Cập nhật thông tin đồ thể thao',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật thành công' } }
      },
      delete: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Xóa mặt hàng thể thao',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa thành công' } }
      }
    },
    '/api/admin/sports/items/{id}/adjust-stock': {
      post: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Cân đối tồn kho mặt hàng thể thao',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Điều chỉnh thành công' } }
      }
    },
    '/api/admin/sports/intake': {
      post: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Nhập kho đồ thể thao đơn lẻ',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Nhập kho thành công' } }
      }
    },
    '/api/admin/sports/batch-intake': {
      post: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Nhập kho đồ thể thao theo lô hàng',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Nhập lô thành công' } }
      }
    },
    '/api/admin/sports/intake-history': {
      get: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Lịch sử các đợt nhập hàng thể thao',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách phiếu nhập thể thao' } }
      }
    },
    '/api/admin/sports/pos/order': {
      post: {
        tags: ['Admin Sports Counter & POS'],
        summary: 'Tạo đơn bán hàng POS thể thao & dịch vụ tại quầy',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Bán hàng thể thao thành công' } }
      }
    },

    // ==========================================
    // 10. ADMIN REPORTS (2)
    // ==========================================
    '/api/admin/reports/history': {
      get: {
        tags: ['Admin Reports'],
        summary: 'Lấy dữ liệu chi tiết lịch sử đơn hàng theo khoảng ngày và bộ lọc',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Báo cáo chi tiết' } }
      }
    },
    '/api/admin/reports/summary': {
      get: {
        tags: ['Admin Reports'],
        summary: 'Tổng hợp doanh thu, lợi nhuận gộp và số lượng đơn theo ngày',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Báo cáo tổng hợp' } }
      }
    },

    // ==========================================
    // 11. ADMIN SYSTEM SETTINGS (2)
    // ==========================================
    '/api/admin/settings': {
      get: {
        tags: ['Admin System Settings'],
        summary: 'Lấy cấu hình hệ thống (trạng thái mở quầy, âm báo)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Cấu hình hiện hành' } }
      },
      patch: {
        tags: ['Admin System Settings'],
        summary: 'Cập nhật cấu hình quầy (bật/tắt nhận đơn, cấu hình chuông)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Lưu cấu hình thành công' } }
      }
    },

    // ==========================================
    // 12. ADMIN DATA PURGE & BACKUP (5)
    // ==========================================
    '/api/admin/clean/preview': {
      get: {
        tags: ['Admin Data Purge & Catalog Backup'],
        summary: 'Xem trước số lượng đơn hàng và lịch sử sẽ được xóa khi dọn dẹp',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Thống kê lượng dữ liệu phù hợp điều kiện' } }
      }
    },
    '/api/admin/clean/purge': {
      post: {
        tags: ['Admin Data Purge & Catalog Backup'],
        summary: 'Dọn dẹp vĩnh viễn dữ liệu cũ (Đơn đã thanh toán/đã hủy theo thời gian)',
        description: 'Bắt buộc quyền backup và Action Proof data.purge xác thực cấp 2.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Dọn dẹp thành công' } }
      }
    },
    '/api/admin/backup/full': {
      post: {
        tags: ['Admin Data Purge & Catalog Backup'],
        summary: 'Xuất file sao lưu snapshot toàn diện (Full System JSON Backup)',
        description: 'Bắt buộc quyền backup và Action Proof backup.export xác thực cấp 2.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Tải về file sao lưu JSON' } }
      }
    },
    '/api/admin/catalog/import': {
      post: {
        tags: ['Admin Data Purge & Catalog Backup'],
        summary: 'Nhập dữ liệu sao lưu (Catalog & Hệ Thống) từ file JSON',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Khôi phục dữ liệu thành công' } }
      }
    },
    '/api/admin/audit-logs': {
      get: {
        tags: ['Admin Data Purge & Catalog Backup'],
        summary: 'Xem nhật ký kiểm toán hành vi quản trị (Audit Logs)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách nhật ký kiểm toán' } }
      }
    },

    // ==========================================
    // 13. ADMIN RBAC MANAGEMENT (10)
    // ==========================================
    '/api/admin/rbac/permissions': {
      get: {
        tags: ['Admin RBAC Management'],
        summary: 'Danh sách quyền hạn chức năng trong hệ thống',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh mục quyền' } }
      }
    },
    '/api/admin/rbac/roles': {
      get: {
        tags: ['Admin RBAC Management'],
        summary: 'Lấy danh sách vai trò nhân viên',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách vai trò' } }
      },
      post: {
        tags: ['Admin RBAC Management'],
        summary: 'Tạo vai trò mới kèm ma trận quyền',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Tạo vai trò thành công' } }
      }
    },
    '/api/admin/rbac/roles/{roleId}': {
      put: {
        tags: ['Admin RBAC Management'],
        summary: 'Cập nhật quyền hạn cho vai trò',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'roleId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật vai trò thành công' } }
      },
      delete: {
        tags: ['Admin RBAC Management'],
        summary: 'Xóa vai trò nhân viên',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'roleId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa vai trò thành công' } }
      }
    },
    '/api/admin/rbac/users': {
      get: {
        tags: ['Admin RBAC Management'],
        summary: 'Lấy danh sách tài khoản nhân viên',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Danh sách tài khoản' } }
      },
      post: {
        tags: ['Admin RBAC Management'],
        summary: 'Tạo tài khoản nhân viên mới',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Tạo tài khoản thành công' } }
      }
    },
    '/api/admin/rbac/users/{userId}': {
      put: {
        tags: ['Admin RBAC Management'],
        summary: 'Cập nhật thông tin / vai trò / trạng thái hoạt động của nhân viên',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Cập nhật tài khoản thành công' } }
      },
      delete: {
        tags: ['Admin RBAC Management'],
        summary: 'Xóa tài khoản nhân viên và thu hồi phiên đăng nhập tức thì',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Xóa tài khoản thành công' } }
      }
    },
    '/api/admin/rbac/users/{userId}/password': {
      put: {
        tags: ['Admin RBAC Management'],
        summary: 'Quản trị viên đặt lại mật khẩu cho nhân viên',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-action-proof', in: 'header', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Đặt lại mật khẩu thành công' } }
      }
    }
  }
};

export const openapiSpec = enrichOpenApiSpec(baseOpenapiSpec);
