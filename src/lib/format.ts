/**
 * Định dạng hiển thị & sinh text báo giá. Module thuần, không import nội bộ
 * (chạy được cả trên client, server, và node:test).
 */

const vnd = new Intl.NumberFormat("vi-VN");

function sumCny(items: { quantity: number; unitPriceCny: number }[]): number {
  return items.reduce((s, it) => s + it.quantity * it.unitPriceCny, 0);
}

export function formatVnd(n: number): string {
  return `${vnd.format(Math.round(n))}₫`;
}

export function formatCny(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${s}¥`;
}

export function formatDateTime(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d * 1000) : d;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ageInDays(d: Date | number): number {
  const ms = (typeof d === "number" ? d * 1000 : d.getTime());
  return Math.floor((Date.now() - ms) / 86_400_000);
}

export type QuoteItem = {
  name: string;
  attributes?: string | null;
  quantity: number;
  unitPriceCny: number;
};

export type QuoteInput = {
  customerName: string;
  items: QuoteItem[];
  exchangeRate: number;
  serviceFee: number;
  shippingFee: number;
  deposit: number;
};

/** Số tiền VND dạng gọn cho khách xem (chỉ nhóm nghìn, không ký hiệu). */
function plainVnd(n: number): string {
  return vnd.format(Math.round(n));
}

/**
 * Footer "Lưu ý" cố định trong mọi tin chốt đơn HeyP.
 * Nguồn: docs/reference-heyp-chot-don-template.md. Sửa ở đây nếu đổi chính sách.
 */
export const HEYP_QUOTE_TERMS = `Lưu ý:
❌ Hàng order không huỷ, không đổi trả (ngoại trừ lỗi từ nhà sản xuất hoặc từ shop như: không đúng sản phẩm, màu, size đã đặt).
✨ Tiệm tư vấn dựa trên bảng size của hãng & kinh nghiệm cá nhân. Mọi sự lựa chọn cuối cùng là của quý khách.
✨ Form bàn chân mỗi người là khác nhau. Mọi thông số của sản phẩm chỉ tương đối, không thể chuẩn 100% với tất cả mọi người. Vì vậy vấn đề rộng chật, tiệm chỉ có hỗ trợ đăng pass.`;

/**
 * Sinh text chốt đơn để copy dán thẳng vào Zalo — theo đúng mẫu HeyP.
 * Total = tiền hàng (VND) + phí dịch vụ, CHƯA gồm ship (ship thu sau khi hàng về).
 */
export function buildQuoteText(input: QuoteInput): string {
  const goodsTotalCny = sumCny(input.items);
  const goodsTotalVnd = Math.round(goodsTotalCny * input.exchangeRate);
  const total = goodsTotalVnd + Math.round(input.serviceFee); // giá bán, chưa ship
  const remainingBeforeShip = total - Math.round(input.deposit);

  const lines: string[] = [];
  lines.push("Dạ vâng HeyP chốt đơn cho quý khách:");
  lines.push("");
  lines.push("— Tên sp:");
  for (const it of input.items) {
    const attr = it.attributes ? ` - ${it.attributes}` : "";
    const qty = it.quantity > 1 ? ` × ${it.quantity}` : "";
    lines.push(`${it.name} (như hình)${attr}${qty}`);
  }
  lines.push("");
  lines.push(`=> Total: ${plainVnd(total)}`);
  if (input.deposit > 0) lines.push(`📌 Đã cọc: ${plainVnd(input.deposit)}`);
  if (input.shippingFee > 0) {
    lines.push(
      `📌 Còn lại: ${plainVnd(remainingBeforeShip + Math.round(input.shippingFee))}`,
    );
  } else {
    lines.push(`📌 Còn lại: ${plainVnd(remainingBeforeShip)} + ship`);
  }
  lines.push("");
  lines.push("Hàng về tiệm sẽ nhắn quý khách trước khi ship nhé.");
  lines.push("————————————");
  lines.push(HEYP_QUOTE_TERMS);
  return lines.join("\n");
}
