"use client";

/**
 * Lưới an toàn cuối: lỗi ném ra từ chính root layout, tức là error.tsx thường
 * không dựng được. Next thay THẾ toàn bộ cây, nên file này phải tự có
 * <html>/<body>.
 *
 * Không import globals.css và không dùng class của dự án: nếu lỗi nằm ở khâu
 * nạp CSS thì mọi class đều vô nghĩa. Style viết thẳng inline để trang này
 * luôn đọc được, dù có chuyện gì xảy ra.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f4f6f8",
          color: "#10161f",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <p style={{ fontSize: 19, fontWeight: 600, margin: "0 0 8px" }}>
            Ứng dụng gặp sự cố
          </p>
          <p style={{ color: "#5b6673", margin: "0 0 20px", lineHeight: 1.5 }}>
            Tải lại trang thường là đủ. Nếu vẫn lỗi, đăng nhập lại.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid transparent",
                background: "#0e5a87",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Thử lại
            </button>
            <a
              href="/login"
              style={{
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #cfd7e0",
                background: "#fff",
                color: "#0e5a87",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Đăng nhập lại
            </a>
          </div>
          {error.digest ? (
            <p style={{ color: "#8b949f", fontSize: 13, marginTop: 20 }}>
              Mã lỗi: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
