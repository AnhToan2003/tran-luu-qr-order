import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Court } from '../types/order';

/**
 * Tạo URL canonical cho mã QR của sân
 */
export function getCourtOrderUrl(courtCode: string): string {
  const origin = window.location.origin;
  return `${origin}/order?court=${courtCode}`;
}

/**
 * Sinh ảnh PNG chất lượng cao của mã QR
 */
export async function generateCourtQrPng(courtCode: string): Promise<string> {
  const url = getCourtOrderUrl(courtCode);
  return QRCode.toDataURL(url, {
    width: 600,
    margin: 2,
    color: {
      dark: '#12432E',
      light: '#FFFFFF'
    }
  });
}

/**
 * Tải file ảnh PNG mã QR cho 1 sân
 */
export async function downloadCourtQrPng(court: Court): Promise<void> {
  const dataUrl = await generateCourtQrPng(court.code);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `QR_San_${court.code}_Tran_Luu.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Tạo và tải tệp PDF dàn trang toàn bộ 16 sân chuẩn khổ A4 sẵn sàng in ấn dán sân (BR-19, BR-34)
 */
export async function downloadAllCourtsPdf(courts: Court[]): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Khổ A4: 210mm x 297mm
  // Dàn 4 sân trên 1 trang (2x2) -> 16 sân chiếm 4 trang
  const courtsPerPage = 4;
  const totalPages = Math.ceil(courts.length / courtsPerPage);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();

    const pageCourts = courts.slice(page * courtsPerPage, (page + 1) * courtsPerPage);

    for (let i = 0; i < pageCourts.length; i++) {
      const court = pageCourts[i];
      const col = i % 2; // 0 or 1
      const row = Math.floor(i / 2); // 0 or 1

      const x = 15 + col * 95;
      const y = 15 + row * 135;
      const cardWidth = 85;
      const cardHeight = 125;

      // Card border
      doc.setDrawColor(18, 67, 46);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4);

      // Header Brand Background
      doc.setFillColor(18, 67, 46);
      doc.rect(x, y, cardWidth, 18, 'F');

      // Brand Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SAN CAU LONG TRAN LUU', x + cardWidth / 2, y + 11, { align: 'center' });

      // Court Name
      doc.setTextColor(19, 122, 73);
      doc.setFontSize(18);
      doc.text(`SAN ${court.code}`, x + cardWidth / 2, y + 30, { align: 'center' });

      // Generate QR Image
      const qrDataUrl = await generateCourtQrPng(court.code);
      doc.addImage(qrDataUrl, 'PNG', x + 12.5, y + 36, 60, 60);

      // Subtitle Instructions
      doc.setTextColor(24, 44, 34);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('QUET MA GOI NUOC GIAO TAN SAN', x + cardWidth / 2, y + 106, { align: 'center' });

      doc.setTextColor(92, 111, 98);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Nhan vien mang nuoc tan san & Thu tien', x + cardWidth / 2, y + 113, { align: 'center' });
    }
  }

  doc.save('Bo_Ma_QR_16_San_Tran_Luu.pdf');
}
