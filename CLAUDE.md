# Quản Lý Đèn Tắt CSCC

Ứng dụng PWA quản lý và báo cáo sự cố đèn chiếu sáng công cộng TP.HCM.

## Kiến trúc

- **`dentat.html`** — toàn bộ frontend (HTML + CSS + JS gộp 1 file)
- **`bcsc.html`** — trang báo cáo sự cố độc lập (form-only, không bản đồ); dùng cùng `GOOGLE_SCRIPT_URL` + `GOOGLE_SHEET_CSV_URL`; `fetchNextId` lấy max ID từ CSV; mặc định trạng thái `2`
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
- Quick Fix: cập nhật trạng thái 1 chạm từ popup
- Dải thống kê: 7 chip màu, click để xem danh sách và nhảy bản đồ
- Báo cáo: lọc theo ngày/phường/người, xuất Excel
- Xuất CAD: file `.dxf` tọa độ VN2000 (UTM, GRS80)
- Nhập từ Excel `.xlsx/.xls/.csv`
- Bộ lọc nâng cao: trạng thái, loại đèn (LED/HPS), người phát hiện
- **Nhập từ Zalo**: paste tin nhắn + link Google Maps + SĐT + ảnh → parser tự tách số trụ, tuyến, tọa độ (regex `parseLatLonFromText`, `parseZaloMessage`), mở form marker pre-fill với mã trạng thái 2 (Đang bị Sự cố). Lưu ý: link rút gọn `maps.app.goo.gl` không parse client-side được.
- **Số điện thoại + liên hệ Zalo**: form có trường SĐT người báo, popup hiển thị 2 nút `📞 tel:<phone>` (gọi điện) và `🩷 https://zalo.me/<phone>` (mở chat Zalo). Hàm `normalizePhone` chuẩn hóa: bỏ space/dash, `+84` → `0`.

## Phân quyền

- **admin / quanly** (icon 👑): toàn quyền
- **nhân viên** (icon 👷): thêm/sửa đèn, không quản lý tài khoản
- **demo**: chỉ xem, không ghi dữ liệu

## Cấu hình quan trọng (trong `dentat.html`)

```js
const GOOGLE_SCRIPT_URL = '...';   // Apps Script Web App URL
const GOOGLE_SHEET_CSV_URL = '...'; // Google Sheet CSV public URL
const GITHUB_RAW_BASE = '...';      // Raw GitHub URL cho ảnh
const MAX_IMG_LEN = 32767;          // Giới hạn ảnh base64
```

## PWA / Service Worker

- Cache tĩnh: `dentat.html`, manifest, Leaflet, xlsx, fonts
- Cache tile bản đồ: tối đa 200 tile (OSM + Google satellite)
- `dentat.html`: network-first, fallback cache khi offline
- Google Sheet / Apps Script: không cache (luôn lấy mới)

## Quy tắc khi sửa code

- **Không tách file** — toàn bộ frontend nằm trong `dentat.html`, không tạo file JS/CSS riêng
- **Không thêm thư viện mới** — dùng Leaflet, xlsx.js, Inter font đã có
- **Cập nhật `huongdan.html`** mỗi khi thêm tính năng mới
- Khi thêm trạng thái mới: cập nhật `STATUS_CONFIG`, select `#fTrangThai`, mảng `broken`, dải thống kê HTML, và `huongdan.html`
- Ảnh: luôn resize trước khi upload, giới hạn `MAX_IMG_LEN`
