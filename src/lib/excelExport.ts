import ExcelJS from 'exceljs';
import { Order } from '../types/order';

/**
 * Chống Formula Injection trong file Excel (BR-33)
 */
function sanitizeFormula(val: any): any {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (['=', '+', '-', '@'].includes(trimmed.charAt(0))) {
      return `'${val}`;
    }
  }
  return val;
}

function formatStatusText(status: string): string {
  switch (status) {
    case 'delivered': return 'Đã giao tận sân';
    case 'cancelled': return 'Đã hủy';
    case 'preparing': return 'Đang làm nước';
    case 'accepted': return 'Đã nhận đơn';
    case 'new': return 'Đơn mới';
    default: return status;
  }
}

function addStyledSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  columns: Array<{ header: string; key: string; width?: number; numFmt?: string; align?: 'left' | 'center' | 'right' }>,
  rows: Record<string, any>[]
) {
  const ws = wb.addWorksheet(sheetName);

  ws.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || 20
  }));

  // Style Header
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0A6B4A' } // Primary Green của Trần Lựu
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // Add rows with formatting
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rowData = rows[rIdx];
    const row = ws.addRow(rowData);
    row.height = 24;
    row.font = { size: 10, name: 'Segoe UI' };

    // Zebra striping
    if (rIdx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };
    }

    columns.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.alignment = {
        vertical: 'middle',
        horizontal: col.align || (typeof rowData[col.key] === 'number' ? 'right' : 'left')
      };
      if (col.numFmt && typeof rowData[col.key] === 'number') {
        cell.numFmt = col.numFmt;
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  }

  // Freeze top row
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

export async function exportOrdersToExcel(
  orders: Order[],
  summaryStats?: {
    totalRevenueVnd: number;
    totalBottlesDelivered: number;
    totalIceServed: number;
  }
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sân Cầu Lông Trần Lựu';
  wb.created = new Date();

  // 1. SHEET 1: CHI TIẾT TỪNG MÓN ĐÃ MUA (Sân nào mua món gì, mấy giờ)
  const itemRows: Record<string, any>[] = [];
  let itemStt = 1;
  for (const o of orders) {
    const orderCreatedStr = new Date(o.createdAt).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const orderDeliveredStr = o.deliveredAt
      ? new Date(o.deliveredAt).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : (o.status === 'cancelled' ? 'Đã hủy' : 'Đang xử lý');

    for (const item of o.items) {
      itemRows.push({
        stt: itemStt++,
        displayCode: sanitizeFormula(o.displayCode),
        courtName: sanitizeFormula(o.courtName),
        createdAt: orderCreatedStr,
        deliveredAt: orderDeliveredStr,
        productName: sanitizeFormula(item.name),
        volume: sanitizeFormula(item.volume),
        quantity: item.quantity,
        iceQuantity: item.iceQuantity ? `${item.iceQuantity} ly` : '0',
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        status: formatStatusText(o.status)
      });
    }
  }

  addStyledSheet(
    wb,
    'Chi tiết mua hàng từng món',
    [
      { header: 'STT', key: 'stt', width: 8, align: 'center' },
      { header: 'Mã đơn', key: 'displayCode', width: 18, align: 'center' },
      { header: 'Sân thi đấu', key: 'courtName', width: 16, align: 'center' },
      { header: 'Thời gian đặt', key: 'createdAt', width: 22, align: 'center' },
      { header: 'Thời gian giao', key: 'deliveredAt', width: 22, align: 'center' },
      { header: 'Tên món nước', key: 'productName', width: 28, align: 'left' },
      { header: 'Dung tích', key: 'volume', width: 14, align: 'center' },
      { header: 'Số chai', key: 'quantity', width: 12, numFmt: '#,##0', align: 'center' },
      { header: 'Ly đá (+0đ)', key: 'iceQuantity', width: 14, align: 'center' },
      { header: 'Đơn giá (VNĐ)', key: 'unitPrice', width: 16, numFmt: '#,##0" đ"', align: 'right' },
      { header: 'Thành tiền (VNĐ)', key: 'lineTotal', width: 18, numFmt: '#,##0" đ"', align: 'right' },
      { header: 'Trạng thái đơn', key: 'status', width: 18, align: 'center' }
    ],
    itemRows
  );

  // 2. SHEET 2: TỔNG HỢP THEO ĐƠN HÀNG (GỘP CÁC MÓN THEO ĐƠN)
  const orderRows: Record<string, any>[] = [];
  let orderStt = 1;
  for (const o of orders) {
    const orderCreatedStr = new Date(o.createdAt).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const orderDeliveredStr = o.deliveredAt
      ? new Date(o.deliveredAt).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : (o.status === 'cancelled' ? 'Đã hủy' : 'Đang xử lý');

    const itemsSummary = o.items
      .map(i => `${i.quantity}x ${i.name}${i.iceQuantity ? ` (+${i.iceQuantity} đá)` : ''}`)
      .join(', ');
    const totalBottles = o.items.reduce((s, i) => s + i.quantity, 0);
    const totalIce = o.items.reduce((s, i) => s + i.iceQuantity, 0);

    orderRows.push({
      stt: orderStt++,
      displayCode: sanitizeFormula(o.displayCode),
      courtName: sanitizeFormula(o.courtName),
      createdAt: orderCreatedStr,
      deliveredAt: orderDeliveredStr,
      itemsSummary: sanitizeFormula(itemsSummary),
      totalBottles,
      totalIce: `${totalIce} ly`,
      totalVnd: o.totalVnd,
      status: formatStatusText(o.status)
    });
  }

  const orderSheet = addStyledSheet(
    wb,
    'Tổng hợp theo đơn hàng',
    [
      { header: 'STT', key: 'stt', width: 8, align: 'center' },
      { header: 'Mã đơn', key: 'displayCode', width: 18, align: 'center' },
      { header: 'Sân thi đấu', key: 'courtName', width: 16, align: 'center' },
      { header: 'Thời gian đặt', key: 'createdAt', width: 22, align: 'center' },
      { header: 'Thời gian giao', key: 'deliveredAt', width: 22, align: 'center' },
      { header: 'Chi tiết các món đã mua', key: 'itemsSummary', width: 44, align: 'left' },
      { header: 'Tổng số chai', key: 'totalBottles', width: 14, numFmt: '#,##0', align: 'center' },
      { header: 'Tổng ly đá', key: 'totalIce', width: 14, align: 'center' },
      { header: 'Tổng tiền đơn (VNĐ)', key: 'totalVnd', width: 20, numFmt: '#,##0" đ"', align: 'right' },
      { header: 'Trạng thái', key: 'status', width: 18, align: 'center' }
    ],
    orderRows
  );

  // Thêm dòng TỔNG KẾT ở cuối Sheet 2
  const grandTotalOrders = orders.length;
  const grandTotalBottles = orderRows.reduce((s, r) => s + (typeof r.totalBottles === 'number' ? r.totalBottles : 0), 0);
  const grandTotalRevenue = orderRows.reduce((s, r) => s + (typeof r.totalVnd === 'number' ? r.totalVnd : 0), 0);
  const totalRowIdx = orderSheet.rowCount + 1;
  const totalRow = orderSheet.getRow(totalRowIdx);
  totalRow.height = 28;
  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = '⎯⎯⎯⎯⎯ GRAND TOTAL ⎯⎯⎯⎯⎯';
  totalRow.getCell(3).value = '';
  totalRow.getCell(4).value = '';
  totalRow.getCell(5).value = '';
  totalRow.getCell(6).value = `Tổng ${grandTotalOrders} đơn hàng đã lọc`;
  totalRow.getCell(7).value = grandTotalBottles;
  totalRow.getCell(8).value = '';
  totalRow.getCell(9).value = grandTotalRevenue;
  totalRow.getCell(10).value = '';
  for (let c = 1; c <= 10; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { bold: true, size: 11, name: 'Segoe UI', color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A6B4A' } };
    cell.alignment = { vertical: 'middle', horizontal: c === 9 ? 'right' : c === 7 ? 'center' : 'left' };
    if (c === 9) cell.numFmt = '#,##0" đ"';
    if (c === 7) cell.numFmt = '#,##0';
  }

  // 3. SHEET 3: THỐNG KÊ DOANH THU THEO TỪNG SÂN THI ĐẤU
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const courtMap: Record<string, { count: number; bottles: number; rev: number }> = {};
  for (const o of deliveredOrders) {
    if (!courtMap[o.courtName]) {
      courtMap[o.courtName] = { count: 0, bottles: 0, rev: 0 };
    }
    courtMap[o.courtName].count += 1;
    courtMap[o.courtName].bottles += o.items.reduce((s, i) => s + i.quantity, 0);
    courtMap[o.courtName].rev += o.totalVnd;
  }

  const courtRows = Object.entries(courtMap)
    .sort((a, b) => b[1].rev - a[1].rev)
    .map(([courtName, data], idx) => ({
      stt: idx + 1,
      courtName: sanitizeFormula(courtName),
      count: data.count,
      bottles: data.bottles,
      rev: data.rev
    }));

  addStyledSheet(
    wb,
    'Thống kê theo Sân',
    [
      { header: 'STT', key: 'stt', width: 8, align: 'center' },
      { header: 'Tên sân thi đấu', key: 'courtName', width: 20, align: 'left' },
      { header: 'Số đơn đã giao', key: 'count', width: 16, numFmt: '#,##0', align: 'center' },
      { header: 'Số chai đã bán', key: 'bottles', width: 18, numFmt: '#,##0', align: 'center' },
      { header: 'Tổng doanh thu thực thu (VNĐ)', key: 'rev', width: 26, numFmt: '#,##0" đ"', align: 'right' }
    ],
    courtRows
  );

  // 4. SHEET 4: BÁO CÁO TỔNG HỢP KPI
  const totalRev = summaryStats?.totalRevenueVnd ?? deliveredOrders.reduce((s, o) => s + o.totalVnd, 0);
  const totalBottles = summaryStats?.totalBottlesDelivered ?? deliveredOrders.reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.quantity, 0), 0);
  const totalIce = summaryStats?.totalIceServed ?? deliveredOrders.reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.iceQuantity, 0), 0);

  const summaryRows = [
    { stt: 1, kpi: 'Tên cơ sở', value: 'Sân Cầu Lông Trần Lựu' },
    { stt: 2, kpi: 'Ngày xuất báo cáo', value: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) },
    { stt: 3, kpi: 'Tổng doanh thu thực thu (VNĐ)', value: `${totalRev.toLocaleString('vi-VN')} đ` },
    { stt: 4, kpi: 'Tổng đơn hàng đã giao hoàn tất', value: `${deliveredOrders.length} đơn` },
    { stt: 5, kpi: 'Tổng số chai nước đã giao', value: `${totalBottles} chai` },
    { stt: 6, kpi: 'Tổng số ly đá phục vụ miễn phí', value: `${totalIce} ly` },
    { stt: 7, kpi: 'Tổng số đơn trong bộ lọc', value: `${orders.length} đơn` }
  ];

  addStyledSheet(
    wb,
    'Báo cáo tổng hợp',
    [
      { header: 'STT', key: 'stt', width: 8, align: 'center' },
      { header: 'Chỉ tiêu thống kê', key: 'kpi', width: 34, align: 'left' },
      { header: 'Giá trị ghi nhận', key: 'value', width: 30, align: 'right' }
    ],
    summaryRows
  );

  // Tải file Excel
  const dateStr = new Date().toISOString().slice(0, 10);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `Lich_Su_Ban_Nuoc_Tran_Luu_${dateStr}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
