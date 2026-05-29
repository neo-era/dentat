# Quản Lý Đèn Tắt CSCC

Ứng dụng PWA quản lý và báo cáo sự cố đèn chiếu sáng công cộng TP.HCM.

## Kiến trúc

- **`dentat.html`** — toàn bộ frontend (HTML + CSS + JS gộp 1 file)
- **`bcsc.html`** — trang báo cáo sự cố độc lập (form-only, không bản đồ); dùng cùng `GOOGLE_SCRIPT_URL` + `GOOGLE_SHEET_CSV_URL`; `fetchNextId` dùng `Date.now().toString()` làm ID; mặc định trạng thái `2`; bắt buộc có tọa độ GPS trước khi gửi; tên người báo mặc định `Người dân` nếu bỏ trống; có banner cài PWA (Android `beforeinstallprompt` + iOS tip)
- **`sw.js`** — Service Worker (cache static + tile bản đồ)
- **`manifest.json`** — PWA manifest (icon 192/512)
- **`gas.js`** — Google Apps Script deploy làm Web App (backend proxy)
- **`huongdan.html`** — trang hướng dẫn sử dụng

## Dữ liệu

- **Google Sheet** (CSV public): nguồn dữ liệu đèn, đọc qua `GOOGLE_SHEET_CSV_URL`
- **Google Apps Script**: ghi dữ liệu (thêm/sửa), upload ảnh lên GitHub repo `images/`
- Sheet `DanhSachDen` — dữ liệu đèn; Sheet `TaiKhoan` — tài khoản người dùng
- Ảnh lưu tại `images/<ten>-<timestamp>.jpg`, nhiều ảnh nối bằng dấu `;`
- **20 cột Sheet** (theo thứ tự, định nghĩa trong `FIELDS` của `dentat.html` + `FIELD_MAP` của `gas.js`): ID, Số trụ, Tên tủ, latitude, lontitude, Loại đèn, Công suất, Trang thai, Đường, Phường, Ngày phát hiện, Người phát hiện, Ngày sửa, Người sửa, Vật tư sửa, HÌnh ảnh, Ghi chú, VN2000-X, VN2000-Y, **Số điện thoại**

## Trạng thái đèn (`STATUS_CONFIG`)

| Mã | Nhãn | Màu | Pulse | Chip |
|----|------|-----|-------|------|
| 1 | Đèn LED đang hư | `#ef4444` đỏ | ✓ | LED hư |
| 2 | Đang bị Sự cố | `#db2777` hồng | ✓ | Sự cố |
| 3 | Đèn LED sáng bình thường | `#10b981` xanh lá | — | LED BT |
| 4 | Đèn HPS sáng bình thường | `#0ea5e9` xanh dương | — | HPS BT |
| 5 | Đèn hư quá 10 ngày | `#7c3aed` tím | ✓ | >10 ngày |
| 6 | Sự cố được khắc phục | `#059669` xanh lá đậm | — | Đã KP |
| 7 | Đèn HPS đang hư | `#f97316` cam | ✓ | HPS hư |

**Broken** (hiện số ngày chưa sửa + nút Quick Fix): mã 1, 2, 5, 7

**Quick Fix** logic:
- Mã 1, 5 → mã 3 (LED bình thường)
- Mã 7 → mã 4 (HPS bình thường)
- Mã 2 → mã 6 (Sự cố được khắc phục)

## Tính năng chính

- Bản đồ Leaflet + MarkerCluster, chuyển OSM / vệ tinh Google
- Thêm đèn: GPS hoặc click bản đồ, reverse geocode tên đường/phường qua Nominatim
- Upload ảnh hiện trường: tối đa 3 ảnh/hồ sơ, tên file cách nhau bằng `;`
- Quick Fix: cập nhật trạng thái 1 chạm từ bottom sheet; tự ghi `nguoiSua` = tên tài khoản đang đăng nhập và `ngaySua` = hôm nay
- **Xóa đèn**: nút 🗑 Xóa trong form chỉnh sửa, chỉ hiển thị với role `admin` / `user`; gọi GAS action `delete_row` → xóa hàng khỏi Sheet
- **Bottom sheet thông tin** (`#infoSheet`): thay thế Leaflet popup truyền thống (hay bị mất trên Android); tap dot đèn → sheet trượt lên từ dưới; tap ngoài hoặc nút ✕ để đóng
- Dải thống kê: 7 chip màu, click để xem danh sách và nhảy bản đồ
- Báo cáo: lọc theo ngày/phường/người, xuất Excel
- Xuất CAD: file `.dxf` tọa độ VN2000 (UTM, GRS80)
- Nhập từ Excel `.xlsx/.xls/.csv`
- Bộ lọc nâng cao: trạng thái, loại đèn (LED/HPS), người phát hiện
- **Nhập từ Zalo**: paste tin nhắn + link Google Maps + SĐT + ảnh → parser tự tách số trụ, tuyến, tọa độ (regex `parseLatLonFromText`, `parseZaloMessage`), mở form marker pre-fill với mã trạng thái 2 (Đang bị Sự cố). Lưu ý: link rút gọn `maps.app.goo.gl` không parse client-side được.
- **Số điện thoại + liên hệ Zalo**: form có trường SĐT người báo, popup hiển thị 2 nút `📞 tel:<phone>` (gọi điện) và `🩷 https://zalo.me/<phone>` (mở chat Zalo). Hàm `normalizePhone` chuẩn hóa: bỏ space/dash, `+84` → `0`.

## Phân quyền

| Role | Xem | Thêm/Sửa | Xóa | Quản lý TK |
|------|-----|-----------|-----|------------|
| `admin` (👑) | ✓ | ✓ | ✓ | ✓ |
| `user` (👷) | ✓ | ✓ | ✓ | — |
| `user1` | ✓ | ✓ | — | — |
| `demo` | ✓ | — | — | — |

- `canDelete()` = `role === 'admin' || role === 'user'`
- `isAdmin` = `role === 'admin'` (dùng cho quản lý tài khoản)
- Role lưu trong `localStorage` sau khi đăng nhập từ GAS

## Cấu hình quan trọng (trong `dentat.html`)

```js
const GOOGLE_SCRIPT_URL = '...';   // Apps Script Web App URL
const GOOGLE_SHEET_CSV_URL = '...'; // Google Sheet CSV public URL
const GITHUB_RAW_BASE = '...';      // Raw GitHub URL cho ảnh
const MAX_IMG_LEN = 32767;          // Giới hạn ảnh base64
```

## Toàn vẹn dữ liệu (data integrity)

- **ID là timestamp**: cả `dentat.html` lẫn `bcsc.html` đều gán `id = Date.now().toString()` khi tạo bản ghi mới → ID 13 chữ số, thực tế không trùng nhau khi gửi đồng thời
- **`findRowNum` trong GAS**: nếu payload có `id` → chỉ so khớp theo cột `ID`; nếu không có `id` → fallback theo `Số trụ` (tương thích dữ liệu cũ). Ngăn bcsc ghi chồng lên bản ghi của dentat có cùng số trụ
- **Ảnh**: `uploadImageViaGas` trả về URL tuyệt đối (`GITHUB_RAW_BASE + path`), lưu vào cột `HÌnh ảnh`; nhiều ảnh nối bằng `;`

## PWA / Service Worker

- Cache tĩnh: `dentat.html`, manifest, Leaflet, xlsx, fonts
- Cache tile bản đồ: tối đa 200 tile (OSM + Google satellite)
- `dentat.html`: network-first, fallback cache khi offline
- Google Sheet / Apps Script: không cache (luôn lấy mới)

## Biên bản sự cố (kế hoạch tích hợp)

Mục tiêu: xuất **Biên bản về Sự cố, Bất cập trong Công tác Quản lý, Bảo dưỡng Hệ thống Chiếu sáng Đô thị** (chuẩn mẫu CSCC TP.HCM) dạng PDF từ từng hồ sơ đèn.

> **Không cần thêm cột mới vào Sheet** — toàn bộ biên bản tổng hợp từ dữ liệu hiện có + nội dung cố định theo mẫu.

**Ánh xạ dữ liệu → biên bản:**
- Mã số sự cố = 6 chữ số cuối của `id`
- Đơn vị báo cáo = hằng số `DON_VI_BAO_CAO` trong `dentat.html`
- Người kiểm tra = `nguoiPhatHien`
- Tủ điều khiển = `tenTu` | Đường = `duong` | Phường = `phuong`
- Ngày giờ = `ngayPhatHien`
- Hiện trạng = `ghiChu`
- **Đề xuất** = text mẫu cố định + (nếu có `vatTuSua`) thêm dòng "Vật tư: `<vatTuSua>`"
- **Mục 7 — Ý kiến giám sát** = cố định theo mẫu (in ra ký tay): ✓Có / □Không; □Xử lý gấp / ✓Bình thường; dòng kẻ trống Ý kiến khác
- Hình ảnh = `hinhAnh` (split `;`, hiển thị inline)
- **Trang cuối (trang 4):**
  - Kết luận = text cố định chuẩn mẫu
  - Khối chữ ký trái: "TRUNG TÂM QUẢN LÝ HẠ TẦNG KỸ THUẬT TP.HCM / CHUYÊN VIÊN PHỤ TRÁCH ĐỊA BÀN" → tên tra theo `phuong` từ `phuTrachMap`
  - Khối chữ ký phải: "CÔNG TY CỔ PHẦN CHIẾU SÁNG CÔNG CỘNG TP.HCM / PHỤ TRÁCH KỸ THUẬT THI CÔNG" → tên tra theo `phuong` từ `phuTrachMap`
  - Fallback khi không tra được: để trống (người dùng điền tay sau khi in)
  - Vùng chữ ký = dòng kẻ trống để ký tay sau khi in

**Sheet `PhuTrach`** (tab mới, cùng Google Spreadsheet, published CSV):
| Cột | Nội dung |
|-----|----------|
| `Phường/Xã` | tên phường/xã khớp với cột `Phường` trong `DanhSachDen` |
| `Chuyên viên địa bàn` | tên người ký bên trái biên bản (TTQLHTKT) |
| `Phụ trách KT thi công` | tên người ký bên phải (CSCC) |

**Trong `dentat.html`:**
- Hằng số `PHUTRACH_CSV_URL` — published CSV URL của tab `PhuTrach`
- `let phuTrachMap = {}` — key: `norm(phường)`, value: `{ chuyenVien, phuTrachKT }`
- `loadPhuTrach()` — đọc CSV lúc khởi động, xây dựng `phuTrachMap`
- `printBienBan`: tra `phuTrachMap[norm(row.phuong)]`, fallback trống nếu không tìm thấy

**Triển khai (chưa thực hiện):**
1. Tạo tab `PhuTrach` trong Google Sheet, publish CSV, lấy URL
2. Thêm `PHUTRACH_CSV_URL` + `phuTrachMap` + `loadPhuTrach()` vào `dentat.html`
3. Gọi `loadPhuTrach()` song song với `loadData()` lúc khởi động
4. Thêm nút **📄 Xuất biên bản** vào `#infoSheet`
5. Viết hàm `printBienBan(idx)`: `window.open()` với HTML A4, CSS `@media print`, tự gọi `window.print()`
6. Cập nhật `huongdan.html` (v1.8)

## Quy tắc khi sửa code

- **Không tách file** — toàn bộ frontend nằm trong `dentat.html`, không tạo file JS/CSS riêng
- **Không thêm thư viện mới** — dùng Leaflet, xlsx.js, Inter font đã có
- **Cập nhật `huongdan.html`** mỗi khi thêm tính năng mới
- Khi thêm trạng thái mới: cập nhật `STATUS_CONFIG`, select `#fTrangThai`, mảng `broken`, dải thống kê HTML, và `huongdan.html`
- Ảnh: luôn resize trước khi upload, giới hạn `MAX_IMG_LEN`
- Khi thêm/đổi role: cập nhật bảng Phân quyền trên, hàm `canDelete()`, nhãn role trong UI, và `huongdan.html`
- `gas.js` có action `delete_row` — khi thêm action mới phải deploy lại Apps Script Web App
