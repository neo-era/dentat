# Prompts triển khai tính năng Biên bản sự cố

Thực hiện theo thứ tự. Mỗi prompt là một bước độc lập.

| Prompt | Nội dung | Trạng thái |
|--------|----------|------------|
| 0 | Tạo tab PhuTrach trong Google Sheet | ✅ Xong |
| 1 | Thêm PHUTRACH_CSV_URL + loadPhuTrach() | ✅ Xong |
| 2 | Thêm nút 📄 Biên bản vào infoSheet | ✅ Xong |
| 3 | Viết hàm printBienBan() | ✅ Xong |
| 4 | Cập nhật huongdan.html v1.8 | ⏳ Chưa làm |

---

## Prompt 0 — Chuẩn bị Google Sheet (làm thủ công trước khi chạy code)

```
Thực hiện thủ công trên Google Sheets:
1. Tạo tab mới tên "PhuTrach" trong cùng spreadsheet DanhSachDen
2. Tạo 3 cột header hàng 1:
   "Phường/Xã" | "Chuyên viên địa bàn" | "Phụ trách KT thi công"
3. Điền dữ liệu — tên phường phải khớp chính xác với giá trị cột "Phường"
   trong sheet DanhSachDen (ví dụ: "Phường 8", "Phường 1", ...)
4. File → Share → Publish to web → Sheet "PhuTrach" → CSV → Copy URL
5. Cung cấp URL đó để dùng trong Prompt 1
```

---

## Prompt 1 — Thêm hằng số + hàm loadPhuTrach()

```
Trong dentat.html, ngay sau hằng số GOOGLE_SHEET_CSV_URL, thêm:

  const PHUTRACH_CSV_URL = '<dán URL CSV của tab PhuTrach vào đây>';

Thêm biến toàn cục:
  let phuTrachMap = {};   // key: norm(phuong), value: {chuyenVien, phuTrachKT}

Thêm hàm loadPhuTrach() đọc CSV từ PHUTRACH_CSV_URL:
  - Parse CSV bằng cùng cách đang dùng cho DanhSachDen
  - Header row: "Phường/Xã", "Chuyên viên địa bàn", "Phụ trách KT thi công"
  - Mỗi row: phuTrachMap[norm(phuong)] = { chuyenVien, phuTrachKT }
  - Dùng hàm norm() đã có sẵn trong app để chuẩn hóa key

Gọi loadPhuTrach() song song với loadData() lúc khởi động app
(không await — không chặn việc load bản đồ).
```

---

## Prompt 2 — Thêm nút Xuất biên bản vào infoSheet

```
Trong dentat.html, tìm bottom sheet #infoSheet (sheet thông tin đèn hiện ra
khi tap marker). Trong phần footer của sheet đó (cạnh nút ✏️ Sửa), thêm nút:

  <button id="infoBienBanBtn" onclick="printBienBan(currentInfoIdx)">
    📄 Biên bản
  </button>

Style: outline button, tương tự các nút hiện có trong footer infoSheet.
Biến currentInfoIdx là index marker đang hiển thị (gán khi gọi openInfoSheet(idx)).
Chưa viết hàm printBienBan ở bước này.
```

---

## Prompt 3 — Viết hàm printBienBan()

```
Trong dentat.html, thêm hàm printBienBan(idx).

Dữ liệu nguồn:
  const row     = markersData[idx]
  const ky      = phuTrachMap[norm(row.phuong)] || { chuyenVien: '', phuTrachKT: '' }
  const maSuCo  = String(row.id || '').slice(-6)
  const today   = new Date()
  const ngayIn  = `ngày ${today.getDate()} tháng ${today.getMonth()+1} năm ${today.getFullYear()}`

Hàm tạo chuỗi HTML hoàn chỉnh rồi mở cửa sổ in. HTML gồm 2 trang A4:

━━━ TRANG 1 — Biên bản ━━━

Header 2 cột (bảng không viền, width 100%):
  Cột trái (căn giữa, bold):
    CÔNG TY CỔ PHẦN
    CHIẾU SÁNG CÔNG CỘNG TP.HCM
    ────────────────── (đường kẻ ngang ngắn)

  Cột phải (căn giữa):
    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
    Độc lập - Tự do - Hạnh phúc
    ────────────────── (đường kẻ ngang ngắn)
    (italic) TP.HCM, ${ngayIn}

Tiêu đề chính (căn giữa, bold, chữ hoa, margin-top 20px):
  BIÊN BẢN VỀ SỰ CỐ, BẤT CẬP
  TRONG CÔNG TÁC QUẢN LÝ, BẢO DƯỠNG
  HỆ THỐNG CHIẾU SÁNG ĐÔ THỊ

  Mã số sự cố: ${maSuCo}   ← (bold)

Nội dung (font thường, line-height 1.8, margin-top 16px):

  1 - Đơn vị báo cáo: Công ty Cổ phần Chiếu sáng Công cộng TP.HCM

  2 - Người kiểm tra, phát hiện: ${row.nguoiPhatHien}

  3 - Tên, địa điểm hệ thống bị sự cố, có bất cập:
      - Tủ điều khiển: ${row.tenTu}
      - Đường: ${row.duong}
      - Phường: ${row.phuong}

  4 - Ngày giờ: ${row.ngayPhatHien}

  5 - Ghi nhận hiện trạng sự cố, bất cập:
      ${row.ghiChu}
      (thêm 4 dòng "............................................")

  6 - Đề xuất biện pháp khắc phục (quy mô, khối lượng dự kiến thực hiện):
      "Đề nghị cho duy tu, sửa chữa để khắc phục sự cố, bất cập trong công
      tác quản lý, bảo dưỡng hệ thống trên."
      + nếu row.vatTuSua có giá trị: thêm dòng "Vật tư: ${row.vatTuSua}"
      (thêm 3 dòng "............................................")

  7 - Ý kiến của cán bộ Giám sát: (nội dung CỐ ĐỊNH theo mẫu, không lấy từ data)
      - Cho phép triển khai công việc: [✓] Có        [ ] Không
      - Yêu cầu tiến độ thực hiện:    [ ] Xử lý gấp  [✓] Bình thường
      - Ý kiến khác: .................. (2 dòng kẻ chấm)

  8 - Hình ảnh sự cố, bất cập đính kèm:
      Lấy row.hinhAnh, split(";"), lọc chuỗi rỗng.
      Mỗi ảnh: thẻ <img src="..." style="max-width:45%;margin:4px;display:inline-block">
      Nếu không có ảnh: hiển thị "(Không có ảnh đính kèm)"

━━━ TRANG 2 — Kết luận & Ký tên (page-break-before: always) ━━━

"* Kết luận:" (bold, text-decoration: underline)

Đoạn văn cố định:
  "Các bên cùng thống nhất với các nội dung trên. Yêu cầu Nhà thầu nhanh
  chóng triển khai duy tu, sửa chữa để khắc phục sự cố, bất cập trong công
  tác quản lý, bảo dưỡng hệ thống chiếu sáng đô thị theo đúng tiến độ được
  quy định./."

Khối ký tên (display:flex, justify-content:space-between, margin-top:40px):
  Cột trái (text-align:center, width:45%):
    TRUNG TÂM QUẢN LÝ HẠ TẦNG KỸ THUẬT TP.HCM
    CHUYÊN VIÊN PHỤ TRÁCH ĐỊA BÀN
    (khoảng trống height:70px — để ký tay)
    ${ky.chuyenVien}

  Cột phải (text-align:center, width:45%):
    CÔNG TY CỔ PHẦN CHIẾU SÁNG CÔNG CỘNG TP.HCM
    PHỤ TRÁCH KỸ THUẬT THI CÔNG
    (khoảng trống height:70px — để ký tay)
    ${ky.phuTrachKT || row.nguoiSua || ''}

━━━ CSS ━━━

@media print:
  - body: margin 2cm, font Times New Roman 12pt
  - ẩn mọi thứ trừ nội dung biên bản (#bienban-print)
  - page-break-after: always cho trang 1

━━━ Mở cửa sổ in ━━━

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 600);
```

---

## Prompt 4 — Cập nhật huongdan.html

```
Trong huongdan.html thực hiện 3 thay đổi:

1. Thêm vào danh sách TOC (sau mục #s-delete):
   <li><a href="#s-bienban"><span class="ti">📄</span>Xuất biên bản sự cố</a></li>

2. Thêm section mới #s-bienban sau section #s-delete, gồm:
   - 3 bước:
     Bước 1: Nhấn vào dot đèn trên bản đồ → sheet thông tin trượt lên từ dưới
     Bước 2: Nhấn nút 📄 Biên bản trong sheet thông tin
     Bước 3: Trình duyệt mở trang in →
             In ra giấy: nhấn Print
             Lưu PDF: chọn "Save as PDF" / "Lưu dưới dạng PDF"
             Sau khi in: ký tay vào 2 vùng ký tên cuối trang
   - Tip info: "Tên người ký được điền tự động theo phường từ danh sách cấu hình
     trong Google Sheet tab PhuTrach. Admin cập nhật trực tiếp trên Sheet khi
     nhân sự thay đổi, không cần sửa code."
   - Tip warn: "Nếu phường của đèn chưa có trong danh sách PhuTrach, vùng ký
     tên sẽ để trống — điền tay sau khi in."

3. Cập nhật version topbar từ v1.7 lên v1.8
```

---

## Ghi chú triển khai

- **Không cần thêm cột vào Sheet DanhSachDen** — toàn bộ nội dung biên bản lấy từ dữ liệu hiện có
- **Không cần deploy lại GAS** — chỉ thêm tab PhuTrach (đọc qua CSV public)
- **Thứ tự bắt buộc**: Prompt 0 → lấy URL → Prompt 1 → 2 → 3 → 4
- Prompt 2 và 3 có thể gộp thành 1 lần chạy nếu muốn
