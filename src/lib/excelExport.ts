import * as XLSX from 'xlsx';
import { Order } from '../types/order';

/**
 * Hàm chống CSV / Formula Injection (BR-33)
 * Nếu chuỗi bắt đầu bằng '=', '+', '-', '@' thì thêm dấu nháy đơn ' phía trước
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

export function exportOrdersToExcel(
  orders: Order[],
  summaryStats?: {
    totalRevenueVnd: number;
    totalBottlesDelivered: number;
    totalIceServed: number;
  }
): void {
  const wb = XLSX.utils.book_new();

  // 1. Sheet Tổng hợp
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const totalRev = summaryStats?.totalRevenueVnd ?? deliveredOrders.reduce((s, o) => s + o.totalVnd, 0);
  const totalBottles = summaryStats?.totalBottlesDelivered ?? deliveredOrders.reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.quantity, 0), 0);
  const totalIce = summaryStats?.totalIceServed ?? deliveredOrders.reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.iceQuantity, 0), 0);

  const summaryData = [
    { 'Chỉ số': 'Tên cơ sở', 'Giá trị': 'Sân Cầu Lông Trần Lựu' },
    { 'Chỉ số': 'Ngày xuất báo cáo', 'Giá trị': new Date().toLocaleDateString('vi-VN') },
    { 'Chỉ số': 'Tổng doanh thu đã thu (VNĐ)', 'Giá trị': totalRev },
    { 'Chỉ số': 'Tổng đơn hàng đã giao', 'Giá trị': deliveredOrders.length },
    { 'Chỉ số': 'Tổng số chai nước đã giao', 'Giá trị': totalBottles },
    { 'Chỉ số': 'Tổng số ly đá phục vụ (0đ)', 'Giá trị': totalIce },
    { 'Chỉ số': 'Tổng số đơn trong bộ lọc', 'Giá trị': orders.length }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng hợp');

  // 2. Sheet Đơn hàng
  const ordersData = orders.map(o => ({
    'Mã đơn': sanitizeFormula(o.displayCode),
    'Sân': sanitizeFormula(o.courtName),
    'Trạng thái': o.status === 'delivered' ? 'Đã giao' : o.status === 'cancelled' ? 'Đã hủy' : 'Đang xử lý',
    'Tổng tiền (VNĐ)': o.totalVnd,
    'Giờ đặt': new Date(o.createdAt).toLocaleString('vi-VN'),
    'Giờ giao': o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('vi-VN') : '',
    'Số loại món': o.items.length
  }));
  const wsOrders = XLSX.utils.json_to_sheet(ordersData);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Đơn hàng');

  // 3. Sheet Chi tiết dòng món
  const itemsData: any[] = [];
  for (const o of orders) {
    for (const i of o.items) {
      itemsData.push({
        'Mã đơn': sanitizeFormula(o.displayCode),
        'Sân': sanitizeFormula(o.courtName),
        'Tên món': sanitizeFormula(i.name),
        'Dung tích': sanitizeFormula(i.volume),
        'Đơn giá (VNĐ)': i.unitPrice,
        'Số lượng chai': i.quantity,
        'Số ly đá': i.iceQuantity,
        'Thành tiền (VNĐ)': i.lineTotal,
        'Trạng thái đơn': o.status === 'delivered' ? 'Đã giao' : o.status
      });
    }
  }
  const wsItems = XLSX.utils.json_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Chi tiết món');

  // 4. Sheet Thống kê theo Sân
  const courtStats: Record<string, { courtName: string; count: number; rev: number }> = {};
  for (const o of deliveredOrders) {
    if (!courtStats[o.courtName]) courtStats[o.courtName] = { courtName: o.courtName, count: 0, rev: 0 };
    courtStats[o.courtName].count += 1;
    courtStats[o.courtName].rev += o.totalVnd;
  }
  const courtData = Object.values(courtStats).map(c => ({
    'Tên sân': sanitizeFormula(c.courtName),
    'Số đơn đã giao': c.count,
    'Doanh thu (VNĐ)': c.rev
  }));
  const wsCourts = XLSX.utils.json_to_sheet(courtData);
  XLSX.utils.book_append_sheet(wb, wsCourts, 'Theo Sân');

  // 5. Sheet Theo Sản phẩm
  const prodStats: Record<string, { name: string; bottles: number; rev: number }> = {};
  for (const o of deliveredOrders) {
    for (const i of o.items) {
      if (!prodStats[i.name]) prodStats[i.name] = { name: i.name, bottles: 0, rev: 0 };
      prodStats[i.name].bottles += i.quantity;
      prodStats[i.name].rev += i.lineTotal;
    }
  }
  const prodData = Object.values(prodStats).map(p => ({
    'Tên sản phẩm': sanitizeFormula(p.name),
    'Số chai đã bán': p.bottles,
    'Doanh thu (VNĐ)': p.rev
  }));
  const wsProds = XLSX.utils.json_to_sheet(prodData);
  XLSX.utils.book_append_sheet(wb, wsProds, 'Theo Sản phẩm');

  // Tải file Excel
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Bao_Cao_Doanh_Thu_Tran_Luu_${dateStr}.xlsx`);
}
