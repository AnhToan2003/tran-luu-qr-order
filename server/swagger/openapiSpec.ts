export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Hệ Thống Đặt Nước & Bán Hàng Thể Thao - Sân Cầu Lông Trần Lựu',
    version: '2.0.0',
    description: 'API tài liệu và công cụ thử nghiệm độc lập cho toàn bộ hệ thống sân cầu lông. Bạn có thể gọi API Đăng nhập để lấy token, sau đó bấm nút Authorize ở góc trên bên phải để xác thực cho tất cả các API quản trị.'
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local'
    },
    {
      url: 'https://api.tranluubadminton.vn',
      description: 'Production'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        description: 'Nhập mã token (hoặc accessToken) nhận được từ API POST /api/admin/auth/login'
      }
    },
    schemas: {
      StandardResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Thao tác thành công' }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', example: 'admin123' }
        }
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          token: { type: 'string', example: '8f7a2bc54e3d10...64hex' },
          accessToken: { type: 'string', example: '8f7a2bc54e3d10...64hex' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: { type: 'integer', example: 43200 },
          username: { type: 'string', example: 'admin' },
          roleId: { type: 'string', example: 'admin' },
          mustChangePassword: { type: 'boolean', example: false }
        }
      },
      DrinkBatchIntakeItem: {
        type: 'object',
        required: ['productId', 'quantity', 'costPriceVnd'],
        properties: {
          productId: { type: 'string', example: 'p_aqua_500' },
          quantity: { type: 'integer', minimum: 1, example: 24 },
          costPriceVnd: { type: 'number', minimum: 0, example: 5000 },
          sellingPriceVnd: { type: 'number', minimum: 0, example: 10000 }
        }
      },
      DrinkBatchIntakeRequest: {
        type: 'object',
        required: ['clientRequestId', 'responsiblePerson', 'items'],
        properties: {
          clientRequestId: { type: 'string', minLength: 1, description: 'Khóa idempotency ổn định cho retry' },
          responsiblePerson: { type: 'string', example: 'Nguyễn Văn Quản Lý' },
          note: { type: 'string', example: 'Nhập nước khoáng đầu tuần' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/DrinkBatchIntakeItem' }
          }
        }
      },
      SportsBatchIntakeItem: {
        type: 'object',
        required: ['itemId', 'quantity', 'costPriceVnd'],
        properties: {
          itemId: { type: 'string', example: 'sp_yonex_aerobite' },
          quantity: { type: 'integer', minimum: 1, example: 10 },
          costPriceVnd: { type: 'number', minimum: 0, example: 120000 },
          sellingPriceVnd: { type: 'number', minimum: 0, example: 170000 }
        }
      },
      SportsBatchIntakeRequest: {
        type: 'object',
        required: ['clientRequestId', 'responsiblePerson', 'items'],
        properties: {
          clientRequestId: { type: 'string', minLength: 1, description: 'Khóa idempotency ổn định cho retry' },
          responsiblePerson: { type: 'string', example: 'Trần Thủ Kho' },
          note: { type: 'string', example: 'Nhập cước vợt và phụ kiện' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/SportsBatchIntakeItem' }
          }
        }
      },
      SportsPosOrderItem: {
        type: 'object',
        required: ['itemId', 'quantity'],
        properties: {
          itemId: { type: 'string', example: 'sp_yonex_aerobite' },
          quantity: { type: 'integer', minimum: 1, example: 2 },
          priceVnd: { type: 'number', minimum: 0, example: 170000 }
        }
      },
      SportsPosOrderRequest: {
        type: 'object',
        required: ['clientRequestId', 'items', 'paymentMethod'],
        properties: {
          clientRequestId: { type: 'string', minLength: 1, description: 'Khóa idempotency ổn định cho retry' },
          courtId: { type: 'string', example: 'court_1' },
          customerName: { type: 'string', example: 'Anh Toàn' },
          customerPhone: { type: 'string', example: '0901234567' },
          paymentMethod: { type: 'string', enum: ['cash', 'transfer'], example: 'cash' },
          note: { type: 'string', example: 'Khách mua cước đan vợt' },
          responsiblePerson: { type: 'string', example: 'Nhân viên thu ngân' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/SportsPosOrderItem' }
          }
        }
      }
    }
  },
  security: [
    { BearerAuth: [] }
  ],
  tags: [
    { name: 'Xác thực (Auth)', description: 'Đăng nhập, kiểm tra phiên làm việc và lấy token xác thực' },
    { name: 'Quản lý Đồ Uống & Kho Nước', description: 'Danh mục, sản phẩm nước, nhập kho theo lô & lịch sử' },
    { name: 'Quản lý Đồ Thể Thao & Dịch Vụ', description: 'Mặt hàng thể thao, điều chỉnh kho, nhập kho & bán POS' },
    { name: 'Đơn Hàng & POS Nước', description: 'Đơn hàng khách tại sân, quầy POS và trạng thái xử lý' },
    { name: 'Báo Cáo & Lịch Sử', description: 'Lịch sử bán hàng, doanh thu và tổng hợp lợi nhuận' },
    { name: 'Quản lý Sân', description: 'Danh sách sân, thêm sửa xóa sân cầu lông' },
    { name: 'Phân Quyền (RBAC)', description: 'Quản lý vai trò, tài khoản nhân viên và quyền hạn' },
    { name: 'Hệ Thống & Sao Lưu', description: 'Kiểm tra trạng thái (Healthcheck), cài đặt và sao lưu dữ liệu' }
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Hệ Thống & Sao Lưu'],
        summary: 'Kiểm tra trạng thái hệ thống (Healthcheck)',
        security: [],
        responses: {
          200: {
            description: 'Hệ thống hoạt động bình thường',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    version: { type: 'string', example: '2.0.0' },
                    mongodb: { type: 'string', example: 'connected' },
                    redis: { type: 'string', example: 'connected' },
                    time: { type: 'string', example: '2026-09-18T00:00:00.000Z' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/admin/auth/login': {
      post: {
        tags: ['Xác thực (Auth)'],
        summary: 'Đăng nhập lấy Token xác thực (Admin / Thu ngân)',
        description: 'Đăng nhập bằng tài khoản Quản trị viên để nhận mã Token. Sau khi nhận được token trong phản hồi, hãy copy giá trị token và dán vào nút Authorize ở góc trên để xác thực các API khác.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Đăng nhập thành công, trả về token Bearer',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' }
              }
            }
          },
          401: { description: 'Sai tên đăng nhập hoặc mật khẩu' }
        }
      }
    },
    '/api/admin/auth/session': {
      get: {
        tags: ['Xác thực (Auth)'],
        summary: 'Kiểm tra phiên đăng nhập hiện tại',
        responses: {
          200: {
            description: 'Thông tin tài khoản đang đăng nhập',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    fullName: { type: 'string', example: 'Quản trị viên' },
                    roleName: { type: 'string', example: 'Toàn quyền Admin' },
                    roleId: { type: 'string', example: 'admin' },
                    permissions: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          },
          401: { description: 'Chưa đăng nhập hoặc token không hợp lệ' }
        }
      }
    },
    '/api/admin/auth/logout': {
      post: {
        tags: ['Xác thực (Auth)'],
        summary: 'Đăng xuất tài khoản quản trị viên',
        responses: {
          200: {
            description: 'Đăng xuất thành công, token bị hủy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardResponse' }
              }
            }
          }
        }
      }
    },
    '/api/catalog': {
      get: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Danh mục sản phẩm đồ uống dành cho khách đặt',
        security: [],
        responses: {
          200: { description: 'Danh sách đồ uống đang mở bán' }
        }
      }
    },
    '/api/admin/products': {
      get: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Danh sách sản phẩm đồ uống (Quản trị)',
        responses: {
          200: { description: 'Danh sách sản phẩm đầy đủ giá bán, giá vốn và tồn kho' }
        }
      },
      post: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Thêm sản phẩm nước mới',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'priceVnd', 'categoryId'],
                properties: {
                  name: { type: 'string', example: 'Nước Khoáng Lavie 500ml' },
                  priceVnd: { type: 'number', example: 10000 },
                  costPriceVnd: { type: 'number', example: 5000 },
                  categoryId: { type: 'string', example: 'cat_water' },
                  stock: { type: 'integer', example: 48 }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Tạo sản phẩm thành công' }
        }
      }
    },
    '/api/admin/products/{id}': {
      patch: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Cập nhật thông tin sản phẩm nước',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  priceVnd: { type: 'number' },
                  costPriceVnd: { type: 'number' },
                  stock: { type: 'integer' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Cập nhật thành công' }
        }
      },
      delete: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Xóa sản phẩm nước',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Xóa thành công' }
        }
      }
    },
    '/api/admin/inventory/batch-intake': {
      post: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Nhập hàng theo lô cho đồ uống (Bắt buộc Tên Người Phụ Trách)',
        description: 'Tự động tính toán chi phí vốn, cập nhật tồn kho và lưu đợt nhập.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DrinkBatchIntakeRequest' }
            }
          }
        },
        responses: {
          200: { description: 'Nhập lô hàng thành công' },
          400: { description: 'Thiếu người phụ trách hoặc danh sách hàng rỗng' }
        }
      }
    },
    '/api/admin/inventory/intake-history': {
      get: {
        tags: ['Quản lý Đồ Uống & Kho Nước'],
        summary: 'Lịch sử nhập kho nước (Kèm tính toán Lợi nhuận dự tính)',
        parameters: [
          { name: 'viewMode', in: 'query', schema: { type: 'string', enum: ['batches', 'items'], default: 'batches' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Danh sách các đợt nhập kho nước' }
        }
      }
    },
    '/api/admin/sports/items': {
      get: {
        tags: ['Quản lý Đồ Thể Thao & Dịch Vụ'],
        summary: 'Danh sách mặt hàng dụng cụ thể thao & dịch vụ sân',
        responses: {
          200: { description: 'Danh sách mặt hàng thể thao' }
        }
      },
      post: {
        tags: ['Quản lý Đồ Thể Thao & Dịch Vụ'],
        summary: 'Thêm mới mặt hàng thể thao hoặc dịch vụ',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'sellingPriceVnd', 'category'],
                properties: {
                  name: { type: 'string', example: 'Ống Cầu Lông Ba Sao Pro' },
                  sellingPriceVnd: { type: 'number', example: 250000 },
                  costPriceVnd: { type: 'number', example: 200000 },
                  category: { type: 'string', example: 'cau_long' },
                  unit: { type: 'string', example: 'Ống' },
                  stock: { type: 'integer', example: 30 }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Thêm mặt hàng thành công' }
        }
      }
    },
    '/api/admin/sports/batch-intake': {
      post: {
        tags: ['Quản lý Đồ Thể Thao & Dịch Vụ'],
        summary: 'Nhập hàng theo lô cho đồ thể thao (Bắt buộc Tên Người Phụ Trách)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SportsBatchIntakeRequest' }
            }
          }
        },
        responses: {
          200: { description: 'Nhập lô hàng thể thao thành công' },
          400: { description: 'Thiếu người phụ trách' }
        }
      }
    },
    '/api/admin/sports/intake-history': {
      get: {
        tags: ['Quản lý Đồ Thể Thao & Dịch Vụ'],
        summary: 'Lịch sử nhập kho thể thao (Kèm tính toán Lợi nhuận dự tính)',
        parameters: [
          { name: 'viewMode', in: 'query', schema: { type: 'string', enum: ['batches', 'items'], default: 'batches' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: { description: 'Lịch sử các đợt nhập kho thể thao' }
        }
      }
    },
    '/api/admin/sports/pos/order': {
      post: {
        tags: ['Quản lý Đồ Thể Thao & Dịch Vụ'],
        summary: 'Bán hàng dụng cụ thể thao & dịch vụ tại quầy POS',
        description: 'Tạo đơn bán hàng trực tiếp, trừ tồn kho tức thì và ghi nhận doanh thu / lợi nhuận.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SportsPosOrderRequest' }
            }
          }
        },
        responses: {
          200: { description: 'Thanh toán đơn hàng thành công' }
        }
      }
    },
    '/api/admin/orders/active': {
      get: {
        tags: ['Đơn Hàng & POS Nước'],
        summary: 'Danh sách đơn hàng nước đang hoạt động tại quầy',
        responses: {
          200: { description: 'Danh sách đơn hàng cần pha chế và giao đến sân' }
        }
      }
    },
    '/api/admin/orders/{id}/deliver-and-pay': {
      post: {
        tags: ['Đơn Hàng & POS Nước'],
        summary: 'Giao hàng và thu tiền đơn nước',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  paymentMethod: { type: 'string', enum: ['cash', 'transfer'], example: 'cash' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Cập nhật trạng thái hoàn thành đơn hàng' }
        }
      }
    },
    '/api/admin/reports/history': {
      get: {
        tags: ['Báo Cáo & Lịch Sử'],
        summary: 'Lịch sử bán hàng (Bán Nước & Bán Đồ Thể Thao POS)',
        description: 'Truy vấn lịch sử đơn hàng kèm tính toán tổng doanh thu, tổng chi phí vốn và tổng lợi nhuận thực thu.',
        parameters: [
          { name: 'orderType', in: 'query', required: true, schema: { type: 'string', enum: ['drinks', 'sports_pos'] } },
          { name: 'timePreset', in: 'query', schema: { type: 'string', enum: ['today', 'yesterday', '7days', 'month', 'custom'], default: 'today' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'paymentMethod', in: 'query', schema: { type: 'string', enum: ['all', 'cash', 'transfer'], default: 'all' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 15 } }
        ],
        responses: {
          200: { description: 'Danh sách đơn hàng kèm tổng hợp doanh thu và lợi nhuận' }
        }
      }
    },
    '/api/admin/reports/summary': {
      get: {
        tags: ['Báo Cáo & Lịch Sử'],
        summary: 'Báo cáo doanh thu & lợi nhuận tổng quan',
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month', 'year'], default: 'day' } }
        ],
        responses: {
          200: { description: 'Báo cáo tổng hợp số liệu kinh doanh' }
        }
      }
    },
    '/api/admin/courts': {
      get: {
        tags: ['Quản lý Sân'],
        summary: 'Lấy danh sách tất cả các sân cầu lông',
        responses: {
          200: { description: 'Danh sách sân cầu lông kèm mã QR' }
        }
      },
      post: {
        tags: ['Quản lý Sân'],
        summary: 'Thêm sân cầu lông mới',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Sân số 9' },
                  description: { type: 'string', example: 'Sân tiêu chuẩn thi đấu' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Thêm sân thành công' }
        }
      }
    },
    '/api/admin/rbac/roles': {
      get: {
        tags: ['Phân Quyền (RBAC)'],
        summary: 'Danh sách vai trò trong hệ thống',
        responses: {
          200: { description: 'Danh sách vai trò và quyền hạn tương ứng' }
        }
      }
    },
    '/api/admin/rbac/users': {
      get: {
        tags: ['Phân Quyền (RBAC)'],
        summary: 'Danh sách tài khoản nhân viên / thu ngân',
        responses: {
          200: { description: 'Danh sách người dùng và vai trò' }
        }
      }
    },
    '/api/admin/backup/full': {
      get: {
        tags: ['Hệ Thống & Sao Lưu'],
        summary: 'Tải về file sao lưu toàn bộ cơ sở dữ liệu hệ thống (JSON Backup)',
        responses: {
          200: { description: 'File backup định dạng JSON tải về' }
        }
      }
    }
  }
};
