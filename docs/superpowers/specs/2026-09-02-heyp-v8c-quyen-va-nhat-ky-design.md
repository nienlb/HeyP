# HeyP v8-C — Ba bậc quyền và nhật ký hoạt động

**Ngày:** 02/09/2026
**Trạng thái:** đã chốt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh

Yêu cầu ban đầu gồm một **nút reset DB** cho tài khoản `nien`. Khi bàn tới
phạm vi xoá, yêu cầu đó được **rút lại** và thay bằng: *"tạm thời chuyển về
quyền xoá đơn, edit ví cho nien"*. Nút reset DB **không nằm trong v8-C** và
không được làm.

Đào tiếp thì gốc rễ không phải thiếu tính năng, mà là **không có ranh giới
quyền**:

- Cả **ba** tài khoản (`nien`, `phuong`, `han`) đều đang là `admin`. Hai vai
  trò `admin`/`nhan_vien` tồn tại trên giấy nhưng thực tế không phân tách ai
  với ai.
- Sáu thao tác hệ trọng **chỉ kiểm "đã đăng nhập"**, không kiểm vai trò:

| Thao tác | Vị trí | Hậu quả nếu sai |
| --- | --- | --- |
| Sửa tỷ giá bán và lời mặc định | `settings/actions.ts:13` | Đổi công thức giá cho mọi đơn tạo sau đó |
| Nạp dòng ví ¥ | `finance/actions.ts:27` | Sai số dư và giá vốn bình quân |
| Xoá dòng ví ¥ | `finance/actions.ts:43` | Như trên |
| Xoá chi phí | `finance/actions.ts:85` | Sai báo cáo lãi/lỗ tháng |
| Xoá phiếu thu | `orders/actions.ts:345` | Mất dấu tiền đã nhận, sai công nợ |
| Tải bản sao lưu toàn bộ DB | `api/backup/route.ts:32` | Toàn bộ dữ liệu ra ngoài trong một file |

Xoá đơn (`orders/actions.ts:391`) và xoá khách (`customers/actions.ts:8`)
**đã** kiểm vai trò đúng — chúng không nằm trong danh sách lỗ hổng.

Song song, không có cách nào trả lời câu "ai đã làm việc này": chỉ có
`deletion_log` (bản chụp khi xoá đơn/khách), không có dòng thời gian.

## 2. Phạm vi

Trong phạm vi: ba bậc quyền `owner` > `admin` > `member`; vá sáu lỗ hổng ở
bảng trên; bảng `activity_log` + màn `/admin/activity`; dọn nhật ký định kỳ.

Ngoài phạm vi:

- **Nút reset DB** — đã rút lại.
- **Không đụng** luật tiền, luật trạng thái, tồn kho, ví ¥ về mặt nghiệp vụ.
  v8-C chỉ thêm rào quyền và ghi nhật ký quanh chúng.
- **Không gộp `deletion_log` vào `activity_log`** — xem mục 8.

## 3. Ba vai trò

`owner` > `admin` > `member`. **Nhãn hiển thị dùng đúng ba chữ tiếng Anh đó,
không dịch** — quyết định của người dùng, cố ý lệch khỏi luật "UI tiếng Việt"
vì đây là tên vai trò chứ không phải câu chữ giao diện.

Thay `role === "admin"` rải rác bằng **thang bậc** trong `src/lib/roles.ts`:

```ts
export const USER_ROLES = ["owner", "admin", "member"] as const;

const RANK: Record<UserRole, number> = { member: 0, admin: 1, owner: 2 };

export function atLeast(role: UserRole, min: UserRole): boolean {
  return RANK[role] >= RANK[min];
}
```

và `requireRole(min: UserRole)` trong `src/lib/auth.ts`; `requireAdmin()`
thành `requireRole("admin")`.

Nhờ thang bậc, Owner tự động làm được mọi thứ Admin làm được — không phải
liệt kê hai vai trò ở mỗi chỗ kiểm, và không thể quên một vai trò khi thêm
chỗ kiểm mới.

## 4. Ai làm được gì

| Thao tác | Member | Admin | Owner |
| --- | :---: | :---: | :---: |
| Tạo đơn, sửa đơn, chuyển bước, nhập kho | ✓ | ✓ | ✓ |
| Thu tiền (thêm phiếu), thêm chi phí | ✓ | ✓ | ✓ |
| Xem báo cáo, tồn kho, tài chính | ✓ | ✓ | ✓ |
| Xoá khách | | ✓ | ✓ |
| Xem nhật ký xoá và nhật ký hoạt động | | ✓ | ✓ |
| **Xoá đơn** | | | ✓ |
| **Nạp / xoá dòng ví ¥** | | | ✓ |
| **Xoá phiếu thu** | | | ✓ |
| **Xoá chi phí** | | | ✓ |
| **Sửa tỷ giá bán và lời mặc định** | | | ✓ |
| **Tải bản sao lưu** | | | ✓ |
| **Quản lý thành viên** | | | ✓ |

"Thêm phiếu thu" và "thêm chi phí" **cố ý ở Member**: đó là việc hằng ngày.
Chỉ thao tác *xoá* mới lên Owner — xoá là thứ làm số liệu sai mà không để lại
dấu vết trong chính số liệu.

## 5. Hai rào chắn phải sửa theo

`guardLastAdmin` hiện chặn "hệ thống còn 0 admin". Với mô hình mới nó phải
thành **`guardLastOwner`**: chặn thao tác khiến còn 0 owner đang hoạt động.

Lý do bắt buộc: quản lý thành viên là **Owner-only**. Mất owner cuối cùng
là không ai thêm lại được nữa, **kể cả admin** — phải sửa `password_hash`
hoặc `role` thẳng trong Supabase mới cứu được.

`guardSelfAction` (không tự khoá / tự hạ vai trò / tự xoá chính mình) giữ
nguyên, không đổi.

## 6. Migration

Cột `users.role` là `text` thuần, mặc định `'nhan_vien'`, **không có CHECK
constraint** (đã kiểm trên DB thật). Nên migration nhẹ:

```sql
UPDATE users SET role = 'member' WHERE role = 'nhan_vien';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';
UPDATE users SET role = 'owner' WHERE username = 'nien';
```

Dòng thứ ba là **dữ liệu, không phải cấu trúc**. Vẫn để trong migration có
chủ ý: thiếu nó thì ngay sau deploy hệ thống có 0 owner và **không ai vào
được màn Thành viên nữa**.

Hiện DB có 0 tài khoản `nhan_vien` nên dòng đầu không đụng ai. `phuong` và
`han` giữ nguyên `admin`.

## 7. Bảng `activity_log`

```
id          serial pk
actor       text     -- username
action      text     -- "order.delete", "cny.topup", "session.login"…
entity      text     -- order|customer|payment|expense|cny|user|settings|backup|session
entity_id   integer  -- null với settings/backup/session
detail      text     -- JSON nhỏ: cái gì đổi, bao nhiêu tiền
created_at  bigint   -- epoch-seconds, như mọi bảng khác
```

`actor` là **username, KHÔNG phải khoá ngoại tới `users.id`** — có chủ ý: xoá
một thành viên thì nhật ký vẫn đọc được, không thành `null` hàng loạt. Nhật ký
truy vết mà mất tên người thực hiện thì vô dụng.

Index `(created_at DESC)` cho màn xem, và `(entity, entity_id)` để tra "đơn
này ai đã đụng vào".

Mã hành động theo khuôn `<entity>.<verb>`: `order.create`, `order.update`,
`order.status`, `order.delete`, `customer.delete`, `payment.add`,
`payment.delete`, `expense.add`, `expense.delete`, `cny.topup`, `cny.delete`,
`user.create`, `user.update`, `settings.save`, `backup.download`,
`session.login`, `session.login_failed`.

## 8. Ghi lúc nào — và đánh đổi đã chọn

`logActivity()` chạy **sau khi thao tác đã thành công, NGOÀI transaction, và
nuốt lỗi** (ghi ra console, không ném ra ngoài).

Nghĩa là: ghi nhật ký hỏng thì thao tác nghiệp vụ vẫn thành công và ta mất
một dòng nhật ký. Ngược lại — ghi trong transaction — thì một sự cố ở bảng
nhật ký sẽ **rollback cả việc thu tiền**. Một nhật ký kiểm toán có thể chặn
nghiệp vụ tiền là thứ tệ hơn một nhật ký thủng lỗ chỗ.

**`deletion_log` giữ nguyên trong transaction, không đổi.** Nó không phải
nhật ký, nó là **bản chụp để khôi phục** — mất nó là mất khả năng cứu dữ
liệu, khác hẳn mất một dòng dòng-thời-gian. Hai thứ khác mục đích nên khác
cách ghi, và vì vậy **không gộp hai bảng**.

## 9. Phạm vi ghi: "nặng + tạo/sửa đơn"

Khoảng **25 điểm ghi** trên 6 file action:

- **Tiền:** thêm/xoá phiếu thu, thêm/xoá chi phí, nạp/xoá dòng ví ¥.
- **Xoá:** đơn, khách, món khỏi đơn, ảnh.
- **Đơn:** tạo đơn, đổi trạng thái (kể cả hàng loạt), sửa món, sửa tổng chốt,
  đổi khách của đơn, sửa ghi chú/tỷ giá, sửa giá vốn/lời từng dòng, phí ship.
- **Hệ thống:** tạo/sửa/khoá thành viên, sửa cài đặt giá, tải bản sao lưu,
  đăng nhập thành công và thất bại.

Ghi cả đăng nhập **thất bại** (kèm username đã gõ). **Không bao giờ ghi mật
khẩu, kể cả đã băm.**

## 10. Làm sao không quên điểm ghi

25 điểm ghi rải trong 6 file. Quên một chỗ thì không ai biết cho tới lúc cần
truy vết mà không có gì.

Lưới an toàn: **một test đọc chính mã nguồn** và khẳng định mọi action trong
danh sách bắt buộc đều có gọi `logActivity`:

```ts
const PHAI_GHI = ["deleteOrderAction", "addPaymentAction", "addTopupAction", …];
// đọc file action, cắt thân từng hàm, assert thân đó chứa "logActivity("
```

Không đẹp — nó khớp chuỗi trên mã nguồn chứ không chạy thật. Nhưng nó bắt
đúng lỗi hay xảy ra nhất: thêm action mới rồi quên ghi nhật ký. Dự án không
có DB test nên đây là cách kiểm rẻ nhất mà có thật.

## 11. Màn xem — `/admin/activity`

Admin trở lên. Dùng `DataTable` của v8-A: cột **Thời gian · Người · Hành động
· Đối tượng · Chi tiết**. Chip lọc theo người thực hiện và theo nhóm hành
động. Hiện 200 dòng gần nhất, có nút xem thêm.

Đặt cạnh "Nhật ký xoá" trong màn Cài đặt, không thêm vào nav chính.

Dòng loại `*.delete` có link chéo sang bản chụp tương ứng ở `/admin/deletions`.

## 12. Dọn định kỳ

Ước lượng: ~25 điểm ghi, 2 người dùng → vài trăm dòng/ngày trong ngày bận,
khoảng **20–25MB/năm**. Supabase free có 500MB nên chưa đáng lo, nhưng vẫn
thêm một câu vào cron 4h sẵn có (`/api/cron/track`): **xoá dòng cũ hơn 180
ngày**. Rẻ, và không phải nhớ tới nó nữa.

## 13. Kiểm thử

**Test tự động (module thuần, `node:test`):**

- `atLeast()` — thang bậc: owner ≥ admin ≥ member; member không ≥ admin.
- `parseRole()` với ba giá trị mới, và với `"nhan_vien"` cũ (phải trả `null`).
- `guardLastOwner()` — chặn khi còn đúng 1 owner hoạt động; cho qua khi ≥ 2;
  không chặn khi target không phải owner hoặc đã bị khoá.
- Hàm dựng mã hành động.
- **Test quét mã nguồn** (mục 10).

**Nghiệm thu tay bắt buộc:**

1. Đăng nhập bằng `phuong` (Admin), thử **cả sáu** thao tác Owner-only. Phải
   bị chặn **ở server**, không chỉ ẩn nút. Đây là điểm dễ sai nhất: ẩn nút mà
   quên chặn action là **quyền giả** — người biết URL vẫn gọi được.
2. `nien` (Owner) vẫn làm được tất cả.
3. Sau khi hạ `phuong` xuống Admin, thử hạ nốt `nien` — `guardLastOwner` phải
   chặn.
4. Mở `/admin/activity` bằng Admin: xem được. Bằng Member: bị đá về `/`.

## 14. Rủi ro

| Rủi ro | Cách chặn |
| --- | --- |
| Tự khoá mình khỏi màn Thành viên (0 owner) | `guardLastOwner` + dòng `UPDATE … SET role='owner' WHERE username='nien'` trong migration |
| Ẩn nút mà quên chặn server action → quyền giả | Nghiệm thu tay mục 13.1 thử thẳng vào action, không chỉ nhìn giao diện |
| Thêm action mới, quên ghi nhật ký | Test quét mã nguồn (mục 10) |
| Nhật ký chặn nghiệp vụ tiền | Ghi ngoài transaction, nuốt lỗi (mục 8) |
| Nhật ký phình chiếm hết 500MB | Dọn 180 ngày trong cron 4h (mục 12) |
| Lọt mật khẩu vào nhật ký | Chỉ ghi username ở `session.login_failed`; không truyền `formData` thô vào `detail` |
