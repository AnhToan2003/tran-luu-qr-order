import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const productsDir = path.join(rootDir, 'public', 'images', 'products');
const sportsDir = path.join(rootDir, 'public', 'images', 'sports');

fs.mkdirSync(productsDir, { recursive: true });
fs.mkdirSync(sportsDir, { recursive: true });

// REAL ORDER PRODUCTS DATA
export const REAL_PRODUCTS_DATA = [
  {
    productId: 'prod-aquafina-500ml',
    name: 'Aquafina 500ml',
    volume: '500ml',
    category: 'water' as const,
    stock: 235,
    costPriceVnd: 5000,
    priceVnd: 10000,
    tag: 'Nước suối',
    imageFileName: 'aquafina-500ml.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2563/79247/bhx/nuoc-tinh-khiet-aquafina-500ml-202407121618240191.jpg'
  },
  {
    productId: 'prod-aquafina-1500ml',
    name: 'Aquafina 1,5lit',
    volume: '1.5L',
    category: 'water' as const,
    stock: 89,
    costPriceVnd: 9000,
    priceVnd: 18000,
    tag: 'Chai lớn',
    imageFileName: 'aquafina-1500ml.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2563/79248/bhx/nuoc-tinh-khiet-aquafina-15-lit-202407121618586026.jpg'
  },
  {
    productId: 'prod-7up-lon',
    name: '7up',
    volume: 'Lon 320ml',
    category: 'soda' as const,
    stock: 15,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Có gas',
    imageFileName: '7up.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2443/76450/bhx/nuoc-ngot-7-up-vi-chanh-320ml-202312290940561578.jpg'
  },
  {
    productId: 'prod-pepsi-lon',
    name: 'Pepis',
    volume: 'Lon 320ml',
    category: 'soda' as const,
    stock: 27,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Có gas',
    imageFileName: 'pepsi.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2443/76449/bhx/nuoc-ngot-pepsi-cola-320ml-202312281403070764.jpg'
  },
  {
    productId: 'prod-revive-muoi-khoang',
    name: 'Revive muối khoáng',
    volume: '500ml',
    category: 'isotonic' as const,
    stock: 101,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Bù khoáng',
    imageFileName: 'revive-muoi-khoang.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3233/79251/bhx/nuoc-khoang-bo-sung-khoang-chat-revive-500ml-202407121620247656.jpg'
  },
  {
    productId: 'prod-revive-chanh-muoi',
    name: 'Revive Chanh muối',
    volume: '500ml',
    category: 'isotonic' as const,
    stock: 95,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Bán chạy',
    imageFileName: 'revive-chanh-muoi.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3233/79252/bhx/nuoc-uong-dien-giai-revive-chanh-muoi-500ml-202407121621008608.jpg'
  },
  {
    productId: 'prod-revive-pro',
    name: 'Revive Pro',
    volume: '500ml',
    category: 'isotonic' as const,
    stock: 26,
    costPriceVnd: 10000,
    priceVnd: 18000,
    tag: 'Thể thao Pro',
    imageFileName: 'revive-pro.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3233/328224/bhx/nuoc-uong-dien-giai-revive-pro-500ml-202409090948303043.jpg'
  },
  {
    productId: 'prod-sting-dau',
    name: 'Sting',
    volume: '330ml',
    category: 'energy' as const,
    stock: 35,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Tăng lực',
    imageFileName: 'sting.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3226/79250/bhx/nuoc-tang-luc-sting-dau-330ml-202312281418461715.jpg'
  },
  {
    productId: 'prod-rockstar',
    name: 'Rockstar',
    volume: 'Lon 250ml',
    category: 'energy' as const,
    stock: 22,
    costPriceVnd: 10000,
    priceVnd: 18000,
    tag: 'Tăng lực',
    imageFileName: 'rockstar.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3226/280628/bhx/nuoc-tang-luc-rockstar-250ml-202407121621379758.jpg'
  },
  {
    productId: 'prod-pocari-500ml',
    name: 'Pocari 500ml',
    volume: '500ml',
    category: 'isotonic' as const,
    stock: 12,
    costPriceVnd: 11000,
    priceVnd: 20000,
    tag: 'Bù điện giải',
    imageFileName: 'pocari-500ml.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3233/178044/bhx/nuoc-uong-ion-pocari-sweat-500ml-202407121622143094.jpg'
  },
  {
    productId: 'prod-pocari-900ml',
    name: 'Pocari 900ml',
    volume: '900ml',
    category: 'isotonic' as const,
    stock: 32,
    costPriceVnd: 18000,
    priceVnd: 32000,
    tag: 'Chai lớn',
    imageFileName: 'pocari-900ml.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3233/178045/bhx/nuoc-uong-ion-pocari-sweat-900ml-202407121622513410.jpg'
  },
  {
    productId: 'prod-tra-olong-xanh',
    name: 'Trà ô long Xanh',
    volume: '455ml',
    category: 'tea' as const,
    stock: 1,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Thanh nhiệt',
    imageFileName: 'tra-olong-xanh.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/82270/bhx/tra-o-long-tea-plus-khong-duong-450ml-202312290949102434.jpg'
  },
  {
    productId: 'prod-olong-tea-plus',
    name: 'Ô long tea plus',
    volume: '455ml',
    category: 'tea' as const,
    stock: 7,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Trà Ô Long',
    imageFileName: 'olong-tea-plus.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/82269/bhx/tra-o-long-tea-plus-450ml-202312281414434241.jpg'
  },
  {
    productId: 'prod-olong-chanh-yuzu',
    name: 'Ô Long trà chanh Yuzu',
    volume: '455ml',
    category: 'tea' as const,
    stock: 28,
    costPriceVnd: 9500,
    priceVnd: 17000,
    tag: 'Chanh Yuzu',
    imageFileName: 'olong-chanh-yuzu.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/311910/bhx/tra-o-long-tea-plus-vi-chanh-yuzu-450ml-202312281415206357.jpg'
  },
  {
    productId: 'prod-olong-dao',
    name: 'Ô long Đào nhiệt đới',
    volume: '455ml',
    category: 'tea' as const,
    stock: 4,
    costPriceVnd: 9500,
    priceVnd: 17000,
    tag: 'Vị Đào',
    imageFileName: 'olong-dao.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/327771/bhx/tra-o-long-tea-plus-vi-dao-450ml-202407221445105741.jpg'
  },
  {
    productId: 'prod-twister-cam',
    name: 'Twter Cam',
    volume: '455ml',
    category: 'juice' as const,
    stock: 25,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Cam ép',
    imageFileName: 'twister-cam.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2564/79253/bhx/nuoc-cam-ep-twister-tropicana-450ml-202407121623284050.jpg'
  },
  {
    productId: 'prod-twister-dau',
    name: 'Twiter Dâu',
    volume: '455ml',
    category: 'juice' as const,
    stock: 0,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Dâu tây',
    imageFileName: 'twister-dau.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2564/233061/bhx/nuoc-trai-cay-twister-vi-dau-450ml-202407121624050016.jpg'
  },
  {
    productId: 'prod-juicy-milk-dau',
    name: 'Juicy milk dâu',
    volume: '350ml',
    category: 'juice' as const,
    stock: 18,
    costPriceVnd: 8000,
    priceVnd: 15000,
    tag: 'Sữa dâu',
    imageFileName: 'juicy-milk-dau.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3232/313886/bhx/sua-chua-uong-juicy-milk-dau-350ml-202407121624419980.jpg'
  },
  {
    productId: 'prod-banh-slide',
    name: 'Bánh Slide',
    volume: 'Hộp 100g',
    category: 'food' as const,
    stock: 4,
    costPriceVnd: 24000,
    priceVnd: 35000,
    tag: 'Snack khoai tây',
    imageFileName: 'banh-slide.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3364/152345/bhx/khoai-tay-ong-slide-vi-tu-nhien-100g-202407121625189032.jpg'
  },
  {
    productId: 'prod-mi-ly-hao-hao',
    name: 'Mì ly Hảo Hảo',
    volume: 'Ly 67g',
    category: 'food' as const,
    stock: 24,
    costPriceVnd: 8000,
    priceVnd: 15000,
    tag: 'Tôm chua cay',
    imageFileName: 'mi-ly-hao-hao.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/79515/bhx/mi-ly-hao-hao-tom-chua-cay-67g-202407121625555410.jpg'
  },
  {
    productId: 'prod-mi-ly-cung-dinh',
    name: 'Mì ly Cung đình',
    volume: 'Ly 65g',
    category: 'food' as const,
    stock: 24,
    costPriceVnd: 9500,
    priceVnd: 18000,
    tag: 'Sườn hầm',
    imageFileName: 'mi-ly-cung-dinh.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/110903/bhx/mi-ly-cung-dinh-suon-ham-ngu-qua-65g-202407121626322819.jpg'
  },
  {
    productId: 'prod-mi-ly-morden',
    name: 'Mì ly Morden',
    volume: 'Ly 65g',
    category: 'food' as const,
    stock: 19,
    costPriceVnd: 8500,
    priceVnd: 15000,
    tag: 'Lẩu thái tôm',
    imageFileName: 'mi-ly-modern.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/79516/bhx/mi-ly-modern-lau-thai-tom-65g-202407121627091910.jpg'
  },
  {
    productId: 'prod-mi-ly-omachi',
    name: 'Mì ly Omachi',
    volume: 'Ly 68g',
    category: 'food' as const,
    stock: 7,
    costPriceVnd: 11000,
    priceVnd: 20000,
    tag: 'Bò hầm',
    imageFileName: 'mi-ly-omachi.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/86558/bhx/mi-ly-omachi-sot-bo-ham-68g-202407121627461819.jpg'
  },
  {
    productId: 'prod-mi-to-omachi',
    name: 'Mì tô Omachi',
    volume: 'Tô 110g',
    category: 'food' as const,
    stock: 2,
    costPriceVnd: 15000,
    priceVnd: 25000,
    tag: 'Tô lớn',
    imageFileName: 'mi-to-omachi.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/154743/bhx/mi-to-omachi-sot-bo-ham-110g-202407121628231019.jpg'
  },
  {
    productId: 'prod-mi-to-omachi-tron',
    name: 'Mì tô Omachi trộn',
    volume: 'Tô 105g',
    category: 'food' as const,
    stock: 0,
    costPriceVnd: 16000,
    priceVnd: 27000,
    tag: 'Mì trộn sốt',
    imageFileName: 'mi-to-omachi-tron.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/2565/228104/bhx/mi-to-omachi-tron-spaghetti-105g-202407121629000192.jpg'
  },
  {
    productId: 'prod-xuc-xich',
    name: 'Xúc xích',
    volume: 'Cây',
    category: 'food' as const,
    stock: 40,
    costPriceVnd: 6000,
    priceVnd: 12000,
    tag: 'Ăn liền',
    imageFileName: 'xuc-xich.jpg',
    imageUrl: 'https://cdn.tgdd.vn/Products/Images/3042/103986/bhx/xuc-xich-tiet-trung-vissan-bo-goi-175g-5-cay-202407121629370019.jpg'
  }
];

// REAL SPORTS ITEMS & SERVICES DATA
export const REAL_SPORTS_DATA = [
  {
    itemId: 'sport-vot-infinity-edge-001',
    name: 'Vợt Infinity Edge 001',
    category: 'racket' as const,
    unit: 'Cây',
    costPriceVnd: 450000,
    priceVnd: 650000,
    stock: 22,
    minStockThreshold: 3,
    isService: false,
    tag: 'Infinity Edge',
    imageFileName: 'vot-infinity-edge-001.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/vot-cau-long-yonex-nanoflare-001-feel-chinh-hang-1.webp'
  },
  {
    itemId: 'sport-cau-new-start',
    name: 'Cầu New Start',
    category: 'shuttlecock' as const,
    unit: 'Trái',
    costPriceVnd: 18000,
    priceVnd: 25000,
    stock: 244,
    minStockThreshold: 24,
    isService: false,
    tag: 'Độ bền cao',
    imageFileName: 'cau-new-start.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/ong-cau-long-newstar-1.webp'
  },
  {
    itemId: 'sport-quan-can-vs',
    name: 'Quấn cán VS',
    category: 'grip' as const,
    unit: 'Cái',
    costPriceVnd: 8000,
    priceVnd: 15000,
    stock: 222,
    minStockThreshold: 20,
    isService: false,
    tag: 'Thấm mồ hôi',
    imageFileName: 'quan-can-vs.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/quan-can-vot-cau-long-vs-vg002-chinh-hang-1.webp'
  },
  {
    itemId: 'sport-quan-can-yonex',
    name: 'Quấn cán Yonex',
    category: 'grip' as const,
    unit: 'Cái',
    costPriceVnd: 22000,
    priceVnd: 35000,
    stock: 50,
    minStockThreshold: 10,
    isService: false,
    tag: 'Chính hãng',
    imageFileName: 'quan-can-yonex.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/quan-can-vot-cau-long-yonex-ac102ex-1.webp'
  },
  {
    itemId: 'sport-vo-ngan-yonex',
    name: 'Vớ ngắn Yonex',
    category: 'sock_short' as const,
    unit: 'Đôi',
    costPriceVnd: 25000,
    priceVnd: 45000,
    stock: 16,
    minStockThreshold: 5,
    isService: false,
    tag: 'Cổ ngắn',
    imageFileName: 'vo-ngan-yonex.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/tat-cau-long-yonex-co-ngan-trang-1.webp'
  },
  {
    itemId: 'sport-vo-dai-yonex',
    name: 'Vớ dài Yonex',
    category: 'sock_long' as const,
    unit: 'Đôi',
    costPriceVnd: 30000,
    priceVnd: 55000,
    stock: 15,
    minStockThreshold: 5,
    isService: false,
    tag: 'Cổ dài',
    imageFileName: 'vo-dai-yonex.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/tat-cau-long-yonex-co-trung-1.webp'
  },
  {
    itemId: 'sport-vo-tui-zip-yonex',
    name: 'Vớ túi Zip Yonex',
    category: 'sock_short' as const,
    unit: 'Đôi',
    costPriceVnd: 35000,
    priceVnd: 60000,
    stock: 0,
    minStockThreshold: 5,
    isService: false,
    tag: 'Túi Zip cao cấp',
    imageFileName: 'vo-tui-zip-yonex.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/tat-cau-long-yonex-cao-cap-1.webp'
  },
  {
    itemId: 'sport-bang-dau-yonex',
    name: 'Băng đầu Yonex',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 40000,
    priceVnd: 70000,
    stock: 9,
    minStockThreshold: 3,
    isService: false,
    tag: 'Chặn mồ hôi',
    imageFileName: 'bang-dau-yonex.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-chan-mo-hoi-tran-yonex-1.webp'
  },
  {
    itemId: 'sport-bang-co-tay-yonex',
    name: 'Băng cổ tay Yonex',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 35000,
    priceVnd: 60000,
    stock: 5,
    minStockThreshold: 3,
    isService: false,
    tag: 'Chặn mồ hôi',
    imageFileName: 'bang-co-tay-yonex.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-co-tay-yonex-ac488-chinh-hang-1.webp'
  },
  {
    itemId: 'sport-bang-co-tay-apavi-ah100',
    name: 'Băng cổ tay Apavi AH-100',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 30000,
    priceVnd: 50000,
    stock: 0,
    minStockThreshold: 2,
    isService: false,
    tag: 'Apavi',
    imageFileName: 'bang-co-tay-apavi.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-bao-ve-co-tay-apavi-ah-100-1.webp'
  },
  {
    itemId: 'sport-bang-bap-chan-apavi-ah388',
    name: 'Băng bắp chân Apavi AH-388',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 70000,
    priceVnd: 120000,
    stock: 1,
    minStockThreshold: 2,
    isService: false,
    tag: 'Bảo vệ cơ',
    imageFileName: 'bang-bap-chan-apavi.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-bap-chan-the-thao-apavi-ah-388-1.webp'
  },
  {
    itemId: 'sport-bang-goi-apavi-ah333',
    name: 'Băng gối Apavi AH-333',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 85000,
    priceVnd: 140000,
    stock: 1,
    minStockThreshold: 2,
    isService: false,
    tag: 'Đai bảo vệ gối',
    imageFileName: 'bang-goi-apavi-ah333.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-bao-ve-dau-goi-apavi-ah-333-1.webp'
  },
  {
    itemId: 'sport-bang-goi-soi-apavi-ah301',
    name: 'Băng gối sợi Apavi AH-301',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 95000,
    priceVnd: 160000,
    stock: 1,
    minStockThreshold: 2,
    isService: false,
    tag: 'Sợi co giãn',
    imageFileName: 'bang-goi-apavi-ah301.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-thun-xo-dau-goi-apavi-ah-301-1.webp'
  },
  {
    itemId: 'sport-bang-got-pj',
    name: 'Băng gót PJ',
    category: 'apparel' as const,
    unit: 'Cái',
    costPriceVnd: 60000,
    priceVnd: 95000,
    stock: 1,
    minStockThreshold: 2,
    isService: false,
    tag: 'Bảo vệ gót',
    imageFileName: 'bang-got-pj.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-bao-ve-got-chan-pj-601-1.webp'
  },
  {
    itemId: 'sport-bang-keo-bang-co',
    name: 'Băng keo băng cơ',
    category: 'other' as const,
    unit: 'Cuộn',
    costPriceVnd: 45000,
    priceVnd: 75000,
    stock: 6,
    minStockThreshold: 2,
    isService: false,
    tag: 'Y tế cơ bắp',
    imageFileName: 'bang-keo-bang-co.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/bang-keo-the-thao-dan-co-kinesiology-1.webp'
  },
  {
    itemId: 'sport-binh-xit-lanh-apavi',
    name: 'Bình xịt lạnh Apavi',
    category: 'other' as const,
    unit: 'Chai',
    costPriceVnd: 80000,
    priceVnd: 130000,
    stock: 2,
    minStockThreshold: 2,
    isService: false,
    tag: 'Giảm đau tức thì',
    imageFileName: 'binh-xit-lanh-apavi.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/binh-xit-lanh-giam-dau-the-thao-apavi-1.webp'
  },
  {
    itemId: 'sport-luoi-65-thuong',
    name: 'Lưới 65 thường',
    category: 'service' as const,
    unit: 'Cây',
    costPriceVnd: 90000,
    priceVnd: 140000,
    stock: 0,
    minStockThreshold: 5,
    isService: true,
    tag: 'Cước Yonex BG 65',
    imageFileName: 'cuoc-yonex-bg65.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/cuoc-dan-vot-cau-long-yonex-bg-65-chinh-hang-1.webp'
  },
  {
    itemId: 'sport-luoi-65-ti',
    name: 'Lưới 65 ti',
    category: 'service' as const,
    unit: 'Cây',
    costPriceVnd: 110000,
    priceVnd: 160000,
    stock: 0,
    minStockThreshold: 5,
    isService: true,
    tag: 'BG 65 Titanium',
    imageFileName: 'cuoc-yonex-bg65-ti.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/cuoc-dan-vot-cau-long-yonex-bg-65-titanium-1.webp'
  },
  {
    itemId: 'sport-luoi-66u',
    name: 'Lưới 66u',
    category: 'service' as const,
    unit: 'Cây',
    costPriceVnd: 130000,
    priceVnd: 190000,
    stock: 0,
    minStockThreshold: 5,
    isService: true,
    tag: 'BG 66 Ultimax nảy',
    imageFileName: 'cuoc-yonex-bg66u.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/cuoc-dan-vot-cau-long-yonex-bg-66-ultimax-1.webp'
  },
  {
    itemId: 'sport-luoi-ex-63',
    name: 'Lưới Ex 63',
    category: 'service' as const,
    unit: 'Cây',
    costPriceVnd: 140000,
    priceVnd: 200000,
    stock: 0,
    minStockThreshold: 5,
    isService: true,
    tag: 'Exbolt 63 âm nổ',
    imageFileName: 'cuoc-yonex-exbolt63.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/cuoc-dan-vot-cau-long-yonex-exbolt-63-1.webp'
  },
  {
    itemId: 'sport-luoi-ex-65',
    name: 'Lưới Ex 65',
    category: 'service' as const,
    unit: 'Cây',
    costPriceVnd: 140000,
    priceVnd: 200000,
    stock: 0,
    minStockThreshold: 5,
    isService: true,
    tag: 'Exbolt 65 kiểm soát',
    imageFileName: 'cuoc-yonex-exbolt65.jpg',
    imageUrl: 'https://shopvnb.com//uploads/san_pham/cuoc-dan-vot-cau-long-yonex-exbolt-65-1.webp'
  }
];

// Fallback high-quality SVG generator if CDN image fails
function generateFallbackSvg(name: string, category: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" rx="20" fill="url(#g)"/>
    <circle cx="150" cy="120" r="70" fill="${color}" fill-opacity="0.2"/>
    <text x="150" y="130" font-family="Segoe UI, sans-serif" font-size="32" font-weight="900" fill="${color}" text-anchor="middle">
      ${name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
    </text>
    <text x="150" y="220" font-family="Segoe UI, sans-serif" font-size="16" font-weight="800" fill="#0F172A" text-anchor="middle">
      ${name.length > 20 ? name.slice(0, 18) + '...' : name}
    </text>
    <text x="150" y="245" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#64748B" text-anchor="middle">
      ${category.toUpperCase()}
    </text>
  </svg>`;
}

async function downloadImageWithFallback(url: string, targetPath: string, fallbackName: string, category: string, color = '#0A6B4A') {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 1000) {
        fs.writeFileSync(targetPath, buffer);
        console.log(`[OK] Downloaded: ${path.basename(targetPath)} (${buffer.length} bytes)`);
        return;
      }
    }
    console.warn(`[WARN] Failed to download ${url}, status: ${res.status}. Using fallback SVG.`);
  } catch (err: any) {
    console.warn(`[WARN] Download error for ${url}: ${err.message}. Using fallback SVG.`);
  }

  // Fallback SVG
  const svgPath = targetPath.replace(/\.(jpg|jpeg|png|webp)$/i, '.svg');
  const svgContent = generateFallbackSvg(fallbackName, category, color);
  fs.writeFileSync(svgPath, svgContent, 'utf8');
  console.log(`[SVG] Generated fallback: ${path.basename(svgPath)}`);
}

async function main() {
  console.log('=== STARTING REAL INVENTORY IMPORT & IMAGE SETUP ===');

  // 1. Download Product Images
  console.log('\n--- 1. Downloading Drinks & Food Images ---');
  for (const p of REAL_PRODUCTS_DATA) {
    const dest = path.join(productsDir, p.imageFileName);
    const color = p.category === 'water' ? '#0284C7' : p.category === 'food' ? '#D97706' : '#0A6B4A';
    await downloadImageWithFallback(p.imageUrl, dest, p.name, p.category, color);
  }

  // 2. Download Sports Images
  console.log('\n--- 2. Downloading Sports & Service Images ---');
  for (const s of REAL_SPORTS_DATA) {
    const dest = path.join(sportsDir, s.imageFileName);
    const color = s.isService ? '#2563EB' : '#0A6B4A';
    await downloadImageWithFallback(s.imageUrl, dest, s.name, s.category, color);
  }

  // 3. Connect to MongoDB and Update Collections
  console.log('\n--- 3. Connecting to MongoDB ---');
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'tran_luu_qr_order';
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();

  // Helper to determine image path
  const getProductImagePath = (fileName: string, name: string, cat: string) => {
    const fullPath = path.join(productsDir, fileName);
    if (fs.existsSync(fullPath)) return `/images/products/${fileName}`;
    const svgPath = fullPath.replace(/\.(jpg|jpeg|png|webp)$/i, '.svg');
    if (fs.existsSync(svgPath)) return `/images/products/${path.basename(svgPath)}`;
    return generateFallbackSvg(name, cat, '#0A6B4A');
  };

  const getSportsImagePath = (fileName: string, name: string, cat: string) => {
    const fullPath = path.join(sportsDir, fileName);
    if (fs.existsSync(fullPath)) return `/images/sports/${fileName}`;
    const svgPath = fullPath.replace(/\.(jpg|jpeg|png|webp)$/i, '.svg');
    if (fs.existsSync(svgPath)) return `/images/sports/${path.basename(svgPath)}`;
    return generateFallbackSvg(name, cat, '#2563EB');
  };

  // 4. Update products collection
  console.log('\n--- 4. Updating Products Collection (Order Sân) ---');
  const productsCol = db.collection('products');
  const movementsCol = db.collection('inventory_movements');
  await productsCol.deleteMany({});
  await movementsCol.deleteMany({});

  const productsToInsert = REAL_PRODUCTS_DATA.map((p, idx) => {
    const imagePath = getProductImagePath(p.imageFileName, p.name, p.category);
    return {
      productId: p.productId,
      name: p.name,
      volume: p.volume,
      category: p.category,
      costPriceVnd: p.costPriceVnd,
      priceVnd: p.priceVnd,
      stock: p.stock,
      minStockThreshold: 5,
      tag: p.tag,
      imageSvg: imagePath,
      isAvailable: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1
    };
  });
  await productsCol.insertMany(productsToInsert);
  console.log(`[DB] Inserted ${productsToInsert.length} real products.`);

  // Create initial stock movements for products
  const productMovements = productsToInsert
    .filter(p => p.stock > 0)
    .map(p => ({
      operationId: `mov-init-${p.productId}`,
      productId: p.productId,
      delta: p.stock,
      costPriceVnd: p.costPriceVnd,
      sellingPriceVnd: p.priceVnd,
      totalCostVnd: p.stock * p.costPriceVnd,
      stockAfter: p.stock,
      reason: 'stock_intake',
      note: 'Kiểm kê tồn kho thực tế ban đầu',
      createdAt: now
    }));
  if (productMovements.length > 0) {
    await movementsCol.insertMany(productMovements);
    console.log(`[DB] Created ${productMovements.length} product initial intake movements.`);
  }

  // 5. Update sports_items collection
  console.log('\n--- 5. Updating Sports Items Collection (Quầy Thể Thao) ---');
  const sportsCol = db.collection('sports_items');
  const sportsMovCol = db.collection('sports_movements');
  await sportsCol.deleteMany({});
  await sportsMovCol.deleteMany({});

  const sportsToInsert = REAL_SPORTS_DATA.map((s, idx) => {
    const imagePath = getSportsImagePath(s.imageFileName, s.name, s.category);
    return {
      itemId: s.itemId,
      name: s.name,
      category: s.category,
      unit: s.unit,
      costPriceVnd: s.costPriceVnd,
      priceVnd: s.priceVnd,
      stock: s.isService ? 0 : s.stock,
      minStockThreshold: s.minStockThreshold,
      isService: s.isService,
      isAvailable: true,
      tag: s.tag,
      imageSvg: imagePath,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    };
  });
  await sportsCol.insertMany(sportsToInsert);
  console.log(`[DB] Inserted ${sportsToInsert.length} real sports items & services.`);

  // Create initial stock movements for sports items
  const sportsMovements = sportsToInsert
    .filter(s => !s.isService && s.stock > 0)
    .map(s => ({
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
      note: 'Kiểm kê tồn kho thực tế ban đầu',
      createdAt: now
    }));
  if (sportsMovements.length > 0) {
    await sportsMovCol.insertMany(sportsMovements);
    console.log(`[DB] Created ${sportsMovements.length} sports initial intake movements.`);
  }

  // Calculate totals
  const totalDrinkCost = productsToInsert.reduce((s, p) => s + (p.stock * p.costPriceVnd), 0);
  const totalSportsCost = sportsToInsert.reduce((s, it) => s + (it.stock * it.costPriceVnd), 0);
  console.log(`\n=== IMPORT SUMMARY ===`);
  console.log(`- Total Order Products: ${productsToInsert.length} (Total Cost: ${totalDrinkCost.toLocaleString()} đ)`);
  console.log(`- Total Sports Items: ${sportsToInsert.length} (Total Cost: ${totalSportsCost.toLocaleString()} đ)`);
  console.log(`- Total System Inventory Value: ${(totalDrinkCost + totalSportsCost).toLocaleString()} đ`);

  await client.close();
  console.log('=== REAL INVENTORY IMPORT COMPLETE ===');
}

main().catch(err => {
  console.error('[Error] Fatal:', err);
  process.exit(1);
});
