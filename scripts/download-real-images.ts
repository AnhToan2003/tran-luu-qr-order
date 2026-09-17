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

interface DownloadTask {
  id: string;
  name: string;
  query: string;
  filename: string;
  targetDir: string;
  isSports?: boolean;
}

const TASKS: DownloadTask[] = [
  // Products (Order Sân)
  { id: 'prod-aquafina-500ml', name: 'Aquafina 500ml', query: 'nước suối Aquafina 500ml', filename: 'aquafina-500ml.png', targetDir: productsDir },
  { id: 'prod-aquafina-1500ml', name: 'Aquafina 1,5lit', query: 'Aquafina 1.5L', filename: 'aquafina-1500ml.png', targetDir: productsDir },
  { id: 'prod-7up-lon', name: '7up', query: '7up 320ml lon', filename: '7up.png', targetDir: productsDir },
  { id: 'prod-pepsi-lon', name: 'Pepis', query: 'Pepsi lon xanh 320ml', filename: 'pepsi.png', targetDir: productsDir },
  { id: 'prod-revive-muoi-khoang', name: 'Revive muối khoáng', query: 'Revive muối khoáng 500ml', filename: 'revive-muoi-khoang.png', targetDir: productsDir },
  { id: 'prod-revive-chanh-muoi', name: 'Revive Chanh muối', query: 'Revive chanh muối 500ml', filename: 'revive-chanh-muoi.png', targetDir: productsDir },
  { id: 'prod-revive-pro', name: 'Revive Pro', query: 'Nước uống điện giải Revive', filename: 'revive-pro.png', targetDir: productsDir },
  { id: 'prod-sting-dau', name: 'Sting', query: 'Nước tăng lực Sting dâu chai 330ml', filename: 'sting.png', targetDir: productsDir },
  { id: 'prod-rockstar-lon', name: 'Rockstar', query: 'Nước tăng lực Rockstar lon 250ml', filename: 'rockstar.png', targetDir: productsDir },
  { id: 'prod-pocari-500ml', name: 'Pocari 500ml', query: 'Pocari Sweat 500ml', filename: 'pocari-500ml.png', targetDir: productsDir },
  { id: 'prod-pocari-900ml', name: 'Pocari 900ml', query: 'Pocari Sweat 900ml', filename: 'pocari-900ml.png', targetDir: productsDir },
  { id: 'prod-tra-olong-xanh', name: 'Trà ô long Xanh', query: 'Trà ô long Tea Plus không đường 450ml', filename: 'tra-olong-xanh.png', targetDir: productsDir },
  { id: 'prod-olong-tea-plus', name: 'Ô long tea plus', query: 'Trà ô long Tea Plus 450ml', filename: 'olong-tea-plus.png', targetDir: productsDir },
  { id: 'prod-olong-chanh-yuzu', name: 'Ô Long trà chanh Yuzu', query: 'Trà ô long vị chanh Yuzu Tea Plus 450ml', filename: 'olong-chanh-yuzu.png', targetDir: productsDir },
  { id: 'prod-olong-dao', name: 'Ô long Đào nhiệt đới', query: 'Trà ô long Tea Plus vị đào 450ml', filename: 'olong-dao.png', targetDir: productsDir },
  { id: 'prod-twister-cam', name: 'Twter Cam', query: 'Nước cam ép Twister Tropicana 450ml', filename: 'twister-cam.png', targetDir: productsDir },
  { id: 'prod-twister-dau', name: 'Twiter Dâu', query: 'Nước trái cây ép dâu Twister', filename: 'twister-dau.png', targetDir: productsDir },
  { id: 'prod-juicy-milk-dau', name: 'Juicy milk dâu', query: 'Sữa chua uống trái cây Nutriboost dâu', filename: 'juicy-milk-dau.png', targetDir: productsDir },
  { id: 'prod-banh-slide', name: 'Bánh Slide', query: 'Khoai tây lon Slide 100g', filename: 'banh-slide.png', targetDir: productsDir },
  { id: 'prod-mi-ly-hao-hao', name: 'Mì ly Hảo Hảo', query: 'Mì ly Hảo Hảo tôm chua cay 67g', filename: 'mi-ly-hao-hao.png', targetDir: productsDir },
  { id: 'prod-mi-ly-cung-dinh', name: 'Mì ly Cung đình', query: 'Mì ly Cung Đình sườn hầm ngũ quả 65g', filename: 'mi-ly-cung-dinh.png', targetDir: productsDir },
  { id: 'prod-mi-ly-modern', name: 'Mì ly Morden', query: 'Mì ly Modern lẩu thái tôm 65g', filename: 'mi-ly-modern.png', targetDir: productsDir },
  { id: 'prod-mi-ly-omachi', name: 'Mì ly Omachi', query: 'Mì ly Omachi sườn hầm ngũ quả 68g', filename: 'mi-ly-omachi.png', targetDir: productsDir },
  { id: 'prod-mi-to-omachi', name: 'Mì tô Omachi', query: 'Mì tô Omachi xốt bò hầm', filename: 'mi-to-omachi.png', targetDir: productsDir },
  { id: 'prod-mi-to-omachi-tron', name: 'Mì tô Omachi trộn', query: 'Mì tô trộn Omachi xốt Spaghetti', filename: 'mi-to-omachi-tron.png', targetDir: productsDir },
  { id: 'prod-xuc-xich', name: 'Xúc xích', query: 'Xúc xích tiệt trùng Vissan gói 175g', filename: 'xuc-xich.png', targetDir: productsDir },

  // Sports & Services
  { id: 'sport-vot-infinity-edge-001', name: 'Vợt Infinity Edge 001', query: 'vợt cầu lông Yonex chính hãng', filename: 'vot-infinity-edge-001.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-cau-new-start', name: 'Cầu New Start', query: 'Quả cầu lông New Start', filename: 'cau-new-start.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-quan-can-vs', name: 'Quấn cán VS', query: 'Quấn cán vợt cầu lông VS VG002', filename: 'quan-can-vs.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-quan-can-yonex', name: 'Quấn cán Yonex', query: 'Quấn cán vợt cầu lông Yonex AC102EX', filename: 'quan-can-yonex.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-vo-ngan-yonex', name: 'Vớ ngắn Yonex', query: 'Tất vớ cầu lông Yonex cổ ngắn', filename: 'vo-ngan-yonex.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-vo-dai-yonex', name: 'Vớ dài Yonex', query: 'Tất vớ cầu lông Yonex cổ trung dài', filename: 'vo-dai-yonex.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-vo-tui-zip-yonex', name: 'Vớ túi Zip Yonex', query: 'Tất vớ cầu lông Yonex cao cấp', filename: 'vo-tui-zip-yonex.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-dau-yonex', name: 'Băng đầu Yonex', query: 'Băng trán chặn mồ hôi Yonex', filename: 'bang-dau-yonex.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-co-tay-yonex', name: 'Băng cổ tay Yonex', query: 'Băng bảo vệ cổ tay Yonex', filename: 'bang-co-tay-yonex.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-co-tay-apavi', name: 'Băng cổ tay Apavi AH-100', query: 'Băng bảo vệ cổ tay cầu lông', filename: 'bang-co-tay-apavi.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-bap-chan-apavi', name: 'Băng bắp chân Apavi AH-388', query: 'Băng bắp chân bó cơ thể thao', filename: 'bang-bap-chan-apavi.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-goi-apavi-ah333', name: 'Băng gối Apavi AH-333', query: 'Băng đầu gối thể thao bóng chuyền cầu lông', filename: 'bang-goi-apavi-ah333.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-goi-apavi-ah301', name: 'Băng gối sợi Apavi AH-301', query: 'Bó gối thun dệt kim thể thao', filename: 'bang-goi-apavi-ah301.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-got-pj', name: 'Băng gót PJ', query: 'Băng bảo vệ gót chân thể thao PJ', filename: 'bang-got-pj.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-bang-keo-bang-co', name: 'Băng keo băng cơ', query: 'Băng keo dán cơ Kinesiology thể thao', filename: 'bang-keo-bang-co.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-binh-xit-lanh-apavi', name: 'Bình xịt lạnh Apavi', query: 'Bình xịt lạnh giảm đau chấn thương thể thao', filename: 'binh-xit-lanh-apavi.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-cuoc-yonex-bg65', name: 'Lưới 65 thường', query: 'Cước căng vợt Yonex BG 65 chính hãng', filename: 'cuoc-yonex-bg65.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-cuoc-yonex-bg65-ti', name: 'Lưới 65 ti', query: 'Cước căng vợt Yonex BG 65 Titanium', filename: 'cuoc-yonex-bg65-ti.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-cuoc-yonex-bg66u', name: 'Lưới 66u', query: 'Cước căng vợt Yonex BG 66 Ultimax', filename: 'cuoc-yonex-bg66u.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-cuoc-yonex-exbolt63', name: 'Lưới Ex 63', query: 'Cước căng vợt cầu lông Yonex Exbolt 63', filename: 'cuoc-yonex-exbolt63.png', targetDir: sportsDir, isSports: true },
  { id: 'sport-cuoc-yonex-exbolt65', name: 'Lưới Ex 65', query: 'Cước căng vợt cầu lông Yonex Exbolt 65', filename: 'cuoc-yonex-exbolt65.png', targetDir: sportsDir, isSports: true }
];

async function searchAndDownload(task: DownloadTask): Promise<string | null> {
  const filePath = path.join(task.targetDir, task.filename);
  
  // Try Tiki API first
  try {
    const searchUrl = `https://tiki.vn/api/v2/products?limit=5&q=${encodeURIComponent(task.query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (res.ok) {
      const data: any = await res.json();
      const product = data.data?.[0];
      if (product && product.thumbnail_url) {
        // Use high-res version if available
        const highResUrl = product.thumbnail_url.replace('/280x280/', '/750x750/');
        const imgRes = await fetch(highResUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          if (buffer.length > 3000) {
            fs.writeFileSync(filePath, buffer);
            console.log(`[OK] Downloaded real photo for ${task.name}: ${task.filename} (${buffer.length} bytes)`);
            return task.isSports ? `/images/sports/${task.filename}` : `/images/products/${task.filename}`;
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[WARN] Tiki search failed for ${task.name}:`, err.message);
  }

  // Check if existing file (e.g. cau-new-start.jpg or aquafina-500ml.jpg) exists
  const altJpg = filePath.replace('.png', '.jpg');
  if (fs.existsSync(altJpg) && fs.statSync(altJpg).size > 10000) {
    console.log(`[EXISTS] Keeping existing JPG for ${task.name}`);
    return task.isSports ? `/images/sports/${path.basename(altJpg)}` : `/images/products/${path.basename(altJpg)}`;
  }

  return null;
}

async function main() {
  console.log(`=== STARTING REAL PRODUCT PHOTO DOWNLOAD ===`);
  const results: Record<string, string> = {};

  for (const task of TASKS) {
    const webPath = await searchAndDownload(task);
    if (webPath) {
      results[task.id] = webPath;
    }
    // brief delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\nDownloaded ${Object.keys(results).length}/${TASKS.length} real product photos.`);

  // Now update MongoDB collections
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'tran_luu_qr_order';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const productsCol = db.collection('products');
  const sportsCol = db.collection('sports_items');

  let updatedProducts = 0;
  let updatedSports = 0;

  for (const [id, imgPath] of Object.entries(results)) {
    if (id.startsWith('prod-')) {
      const res = await productsCol.updateOne({ productId: id }, { $set: { imageSvg: imgPath } });
      if (res.modifiedCount > 0) updatedProducts++;
    } else if (id.startsWith('sport-')) {
      const res = await sportsCol.updateOne({ itemId: id }, { $set: { imageSvg: imgPath } });
      if (res.modifiedCount > 0) updatedSports++;
    }
  }

  console.log(`[DB] Updated imageSvg for ${updatedProducts} products and ${updatedSports} sports items.`);
  await client.close();
  console.log('=== COMPLETE ===');
}

main().catch(console.error);
