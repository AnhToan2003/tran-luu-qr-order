export function getSwaggerUiHtml(specUrl: string = '/api-docs/openapi.json', nonce = ''): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Sân Cầu Lông Trần Lựu API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="/api-docs/assets/swagger-ui.css" />
  <link rel="icon" type="image/png" href="/api-docs/assets/favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="/api-docs/assets/favicon-16x16.png" sizes="16x16" />
  <script nonce="${nonce}">
    /* 1. Vô hiệu hóa prefers-color-scheme: dark để Swagger UI không bao giờ tự động chuyển sang chế độ tối */
    try {
      var origMatchMedia = window.matchMedia;
      window.matchMedia = function(query) {
        if (typeof query === 'string' && query.indexOf('prefers-color-scheme') !== -1) {
          return {
            matches: false,
            media: query,
            onchange: null,
            addListener: function() {},
            removeListener: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return false; }
          };
        }
        return origMatchMedia ? origMatchMedia.apply(window, arguments) : { matches: false };
      };
    } catch (e) {}

    /* 2. Loại bỏ hoàn toàn class dark-mode để giữ cố định giao diện sáng trắng như ảnh 1 */
    document.documentElement.classList.remove('dark-mode');
    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function() {
        if (document.documentElement.classList.contains('dark-mode')) {
          document.documentElement.classList.remove('dark-mode');
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
  </script>
  <style>
    :root, html, body {
      color-scheme: light !important;
    }
    html {
      box-sizing: border-box;
      overflow-y: scroll;
      background: #ffffff !important;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #ffffff !important;
    }
    .swagger-ui {
      background: #ffffff !important;
    }

    /* Đảm bảo giao diện luôn cố định màu sáng như ảnh 1, triệt tiêu hoàn toàn dark mode */
    .dark-mode,
    .dark-mode body,
    .dark-mode .swagger-ui {
      background-color: #ffffff !important;
      color: #3b4151 !important;
    }
    .dark-mode .swagger-ui .opblock {
      background: initial;
    }
    .dark-mode .swagger-ui .opblock .opblock-summary-method {
      text-shadow: none !important;
    }
    .dark-mode .swagger-ui section.models,
    .dark-mode .swagger-ui .wrapper {
      background-color: #ffffff !important;
    }

    /* Xoá hoàn toàn nút Dark Mode bóng đèn (ảnh 2) để cố định giao diện sáng ảnh 1 */
    .dark-mode-toggle,
    .topbar-wrapper .dark-mode-toggle,
    .topbar-wrapper button[aria-label*="mode"],
    .topbar-wrapper button[title*="mode"],
    button[aria-label*="dark mode"],
    button[aria-label*="light mode"],
    button[title*="dark mode"],
    button[title*="light mode"],
    .theme-button,
    button[class*="theme"] {
      display: none !important;
      visibility: hidden !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="/api-docs/assets/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="/api-docs/assets/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script nonce="${nonce}">
    window.onload = function() {
      document.documentElement.classList.remove('dark-mode');

      /* Plugin ghi đè DarkModeToggle thành null để không bao giờ khởi tạo nút chuyển đổi */
      var DisableDarkModePlugin = function() {
        return {
          components: {
            DarkModeToggle: function() { return null; }
          }
        };
      };

      window.ui = SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl,
          DisableDarkModePlugin
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1
      });
    };
  </script>
</body>
</html>`;
}
