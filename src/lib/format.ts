/**
 * Định dạng hiển thị & sinh text báo giá. Module thuần (dùng cả client + server).
 */
import { computeOrderMoney, sumLineItemsCny } from "./money";

const vnd = new Intl.NumberFormat("vi-VN");

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

/** Sinh text báo giá gọn để copy gửi Zalo. */
export function buildQuoteText(input: QuoteInput): string {
  const goodsTotalCny = sumLineItemsCny(input.items);
  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: input.exchangeRate,
    serviceFee: input.serviceFee,
    shippingFee: input.shippingFee,
    deposit: input.deposit,
  });

  const lines: string[] = [];
  lines.push("📦 BÁO GIÁ — HeyP");
  lines.push(`Khách: ${input.customerName || "(chưa có tên)"}`);
  lines.push("————————————");
  input.items.forEach((it, i) => {
    const attr = it.attributes ? ` (${it.attributes})` : "";
    lines.push(
      `${i + 1}. ${it.name}${attr} × ${it.quantity} — ${formatCny(it.unitPriceCny)}`,
    );
  });
  lines.push("————————————");
  lines.push(
    `Tiền hàng: ${formatCny(goodsTotalCny)} × ${vnd.format(input.exchangeRate)} = ${formatVnd(money.goodsTotalVnd)}`,
  );
  if (input.serviceFee) lines.push(`Phí dịch vụ: ${formatVnd(input.serviceFee)}`);
  if (input.shippingFee) lines.push(`Phí ship: ${formatVnd(input.shippingFee)}`);
  lines.push(`Tạm tính: ${formatVnd(money.subtotalVnd)}`);
  if (input.deposit) lines.push(`Đã cọc: ${formatVnd(input.deposit)}`);
  lines.push(`➡️ Còn phải thu: ${formatVnd(money.amountDue)}`);
  return lines.join("\n");
}
