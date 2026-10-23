// Google Apps Script — Quản lý đèn tắt CSCC
// Deploy: Extensions → Apps Script → Deploy as Web App
// Execute as: Me | Who has access: Anyone
//
// ── CẤU HÌNH BẢO MẬT (Script Properties) ─────────────────────────────────────
// Project Settings → Script Properties:
//   GITHUB_TOKEN : token GitHub (bắt buộc để upload ảnh / ghi file)
//   APP_SECRET   : khóa bí mật dùng chung với client. ĐẶT giá trị này để BẬT
//                  xác thực ghi/xóa/đọc. Bỏ trống = chế độ cũ (ai cũng ghi được).
//                  Giá trị phải trùng const APP_SECRET trong dentat.html & bcsc.html.
//   PWD_PEPPER   : (tùy chọn) chuỗi muối thêm khi hash mật khẩu. Nên đặt.

const SHEET_NAME  = 'DanhSachDen';  // ← Tab chứa dữ liệu đèn
const USERS_SHEET = 'TaiKhoan';     // ← Tab tài khoản: tenDangNhap | matKhau | hoTen | vaiTro

// Cột ngày phải lưu dạng TEXT để Sheets không tự convert sang date serial (tránh lỗi đảo ngày/tháng)
const DATE_TEXT_COLS = new Set(['Ngày phát hiện', 'Ngày sửa']);

// github_write_file chỉ được ghi vào các thư mục này (chặn ghi đè .html/.js của app)
const GITHUB_WRITE_ALLOWED_PREFIXES = ['images/', 'data/'];
const GITHUB_WRITE_BLOCKED_EXT = /\.(html?|js|mjs|json|css|map)$/i;

// Map camelCase JS → tên cột Sheet chính xác
const FIELD_MAP = {
  'id':            'ID',
  'soTru':         'Số trụ',
  'tenTu':         'Tên tủ',
  'lat':           'latitude',
  'latitude':      'latitude',
  'lon':           'lontitude',
  'longitude':     'lontitude',
  'lontitude':     'lontitude',
  'loaiDen':       'Loại đèn',
  'congSuat':      'Công suất',
  'trangThai':     'Trang thai',
  'duong':         'Đường',
  'phuong':        'Phường',
  'ngayPhatHien':  'Ngày phát hiện',
  'nguoiPhatHien': 'Người phát hiện',
  'ngaySua':       'Ngày sửa',
  'nguoiSua':      'Người sửa',
  'vatTuSua':      'Vật tư sửa',
  'hinhAnh':       'HÌnh ảnh',
  'ghiChu':        'Ghi chú',
  'vn2000x':       'VN2000-X',
  'vn2000y':       'VN2000-Y',
  'dienThoai':     'Số điện thoại',
};

// ── UTILS ──────────────────────────────────────────────────────────────────

function props() { return PropertiesService.getScriptProperties(); }

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function getUsersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
}

// Chuẩn hóa chuỗi để so sánh (NFC + trim + lowercase)
function norm(s) {
  return String(s || '').normalize('NFC').trim().toLowerCase();
}

// Xây dựng index: norm(header) → col index (0-based)
function buildHeaderIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => { idx[norm(h)] = i; });
  return idx;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Kiểm tra khóa bí mật. Nếu chưa đặt APP_SECRET → cho qua (tương thích chế độ cũ).
function checkSecret(data) {
  const secret = props().getProperty('APP_SECRET');
  if (!secret) return true;                 // chưa bật xác thực
  return String((data && data.secret) || '') === secret;
}

function sha256Hex(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8);
  return bytes.map(function(b){ return ((b & 0xff) + 0x100).toString(16).slice(1); }).join('');
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
// Mật khẩu lưu dạng hash SHA-256(PWD_PEPPER + mật khẩu). Nếu ô còn lưu plaintext
// (dữ liệu cũ) thì vẫn cho đăng nhập 1 lần rồi TỰ GHI ĐÈ bằng hash → nâng cấp dần.

function handleLogin(username, password) {
  const sheet = getUsersSheet();
  if (!sheet) {
    return jsonResponse({ status: 'error', message: 'Sheet "TaiKhoan" chưa được tạo. Admin cần tạo tab này trong Google Sheet.' });
  }

  const allData = sheet.getDataRange().getValues();
  if (allData.length < 2) {
    return jsonResponse({ status: 'error', message: 'Chưa có tài khoản nào trong Sheet TaiKhoan.' });
  }

  const headers = allData[0].map(h => norm(String(h)));
  const colUser = headers.indexOf(norm('tenDangNhap'));
  const colPass = headers.indexOf(norm('matKhau'));
  const colName = headers.indexOf(norm('hoTen'));
  const colRole = headers.indexOf(norm('vaiTro'));

  if (colUser === -1 || colPass === -1) {
    return jsonResponse({ status: 'error', message: 'Sheet TaiKhoan thiếu cột "tenDangNhap" hoặc "matKhau".' });
  }

  const pepper = props().getProperty('PWD_PEPPER') || '';
  const hashed = sha256Hex(pepper + String(password));
  const usernameNorm = norm(username);

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    const rowUser = norm(String(row[colUser] || ''));
    if (rowUser !== usernameNorm) continue;

    const stored = String(row[colPass] || '');
    const isHash = /^[0-9a-f]{64}$/i.test(stored);
    let ok = false;
    if (isHash) {
      ok = stored.toLowerCase() === hashed;
    } else {
      // Legacy plaintext — khớp thì nâng cấp sang hash
      ok = stored === String(password);
      if (ok) {
        try {
          const cell = sheet.getRange(i + 1, colPass + 1);
          cell.setNumberFormat('@');
          cell.setValue(hashed);
        } catch (e) {}
      }
    }
    if (!ok) break; // đúng user sai mật khẩu → dừng, báo sai

    return jsonResponse({
      status: 'ok',
      user: {
        username:    String(row[colUser]).trim(),
        displayName: colName >= 0 ? String(row[colName] || '').trim() || username : username,
        role:        colRole >= 0 ? norm(String(row[colRole] || ''))             : 'user',
      }
    });
  }

  return jsonResponse({ status: 'error', message: 'Sai tên đăng nhập hoặc mật khẩu.' });
}

// ── GET DATA (đọc dữ liệu đèn qua backend, thay cho CSV công khai) ───────────
// Trả mảng object theo header (giữ nguyên chuỗi hiển thị như trên Sheet).
function handleGetData() {
  const sheet = getSheet();
  if (!sheet) return jsonResponse({ status: 'error', message: 'Không tìm thấy sheet: ' + SHEET_NAME });
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2) return jsonResponse({ status: 'ok', rows: [] });
  // getDisplayValues → giữ nguyên chuỗi như người dùng thấy (không bị serial/đảo ngày)
  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const headers = values[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i], obj = {};
    let hasData = false;
    headers.forEach((h, j) => {
      if (!h) return;
      const v = r[j] !== undefined ? r[j] : '';
      obj[h] = v;
      if (v !== '') hasData = true;
    });
    if (hasData) rows.push(obj);
  }
  return jsonResponse({ status: 'ok', rows: rows });
}

// ── GOOGLE DRIVE IMAGE UPLOAD ────────────────────────────────────────────────
// Ảnh lưu trên Google Drive của tài khoản chạy GAS. Trả URL hiển thị trực tiếp
// (endpoint thumbnail, chèn được vào <img>). File để chế độ "ai có link đều xem".
//   DRIVE_FOLDER_ID (Script Property, tùy chọn): ID thư mục Drive muốn chứa ảnh.
//   Bỏ trống → tự tạo/dùng thư mục "DenTat_Images" trong My Drive và nhớ lại ID.

function getDriveFolder() {
  const id = props().getProperty('DRIVE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName('DenTat_Images');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('DenTat_Images');
  props().setProperty('DRIVE_FOLDER_ID', f.getId());
  return f;
}

function handleImageUpload(imageBase64, soTru, ext) {
  try {
    const folder = getDriveFolder();
    const ts = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH-mm-ss") + 'Z';
    const safeName = (soTru || 'img').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const safeExt = /^[a-z0-9]{1,5}$/i.test(String(ext || '')) ? String(ext).toLowerCase() : 'jpg';
    const mime = safeExt === 'png' ? 'image/png' : (safeExt === 'webp' ? 'image/webp' : 'image/jpeg');
    const blob = Utilities.newBlob(Utilities.base64Decode(imageBase64), mime, safeName + '-' + ts + '.' + safeExt);
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    const fid = file.getId();
    // URL hiển thị ổn định trong <img>; lưu cả id để dùng lại nếu cần
    return jsonResponse({ status: 'ok', id: fid, url: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w2000', path: '' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: 'Lưu ảnh lên Drive lỗi: ' + err.message });
  }
}

// ── (LEGACY) GITHUB IMAGE UPLOAD — không còn dùng, giữ lại để tham khảo ───────
function handleImageUploadGithub(imageBase64, soTru, ext) {
  const token = props().getProperty('GITHUB_TOKEN');
  if (!token) {
    return jsonResponse({ status: 'error', message: 'GITHUB_TOKEN chưa được cài trong Script Properties của GAS.' });
  }

  const ts = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH-mm-ss") + 'Z';
  const safeName = (soTru || 'img').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const safeExt = /^[a-z0-9]{1,5}$/i.test(String(ext || '')) ? ext : 'jpg';
  const fileName = safeName + '-' + ts + '.' + safeExt;
  const filePath = 'images/' + fileName;

  const apiUrl = 'https://api.github.com/repos/neo-era/dentat/contents/'
    + filePath.split('/').map(encodeURIComponent).join('/');

  const res = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      message: 'Upload ảnh đèn tắt: ' + fileName,
      content: imageBase64,
      branch: 'main'
    }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    return jsonResponse({ status: 'error', message: 'GitHub API lỗi ' + code + ': ' + res.getContentText() });
  }
  return jsonResponse({ status: 'ok', path: 'images/' + fileName });
}

// ── GITHUB FILE WRITE (chỉ cho images/ + data/, chặn ghi đè code của app) ────

function isAllowedGithubPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  if (!p) return false;
  if (p.indexOf('..') !== -1) return false;          // chặn path traversal
  if (p.charAt(0) === '/') return false;             // chỉ đường dẫn tương đối trong repo
  if (GITHUB_WRITE_BLOCKED_EXT.test(p)) return false; // chặn .html/.js/.json/.css…
  return GITHUB_WRITE_ALLOWED_PREFIXES.some(function(pre){ return p.indexOf(pre) === 0; });
}

function handleGithubWriteFile(filePath, content, sha, message) {
  const token = props().getProperty('GITHUB_TOKEN');
  if (!token) return jsonResponse({ status: 'error', message: 'GITHUB_TOKEN chưa được cài trong Script Properties.' });
  if (!isAllowedGithubPath(filePath)) {
    return jsonResponse({ status: 'error', message: 'Đường dẫn không được phép ghi: ' + filePath + ' (chỉ cho phép images/ và data/, không gồm mã nguồn).' });
  }
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const apiUrl = 'https://api.github.com/repos/neo-era/dentat/contents/' + encodedPath;
  const body = { message: message || 'Update file', content: content, branch: 'main' };
  if (sha) body.sha = sha;
  const res = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    return jsonResponse({ status: 'error', message: 'GitHub API lỗi ' + code + ': ' + res.getContentText().slice(0, 300) });
  }
  return jsonResponse({ status: 'ok' });
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Login — không yêu cầu secret (đây là cổng xác thực credentials)
    if (data.action === 'login') {
      return handleLogin(data.username || '', data.password || '');
    }

    // Mọi action còn lại yêu cầu khóa bí mật (nếu APP_SECRET đã đặt)
    if (!checkSecret(data)) {
      return jsonResponse({ status: 'error', message: 'Mã bảo mật không hợp lệ (secret).' });
    }

    if (data.action === 'get_data') {
      return handleGetData();
    }

    // Upload ảnh đèn tắt (tự tạo tên file)
    if (data.action === 'upload_image') {
      return handleImageUpload(data.imageBase64 || '', data.soTru || '', data.ext || 'jpg');
    }

    // Ghi file tuỳ chỉnh lên GitHub (có whitelist)
    if (data.action === 'github_write_file') {
      return handleGithubWriteFile(data.path || '', data.content || '', data.sha || '', data.message || '');
    }

    // Ghi dữ liệu đèn
    const sheet = getSheet();
    if (!sheet) throw new Error('Không tìm thấy sheet: ' + SHEET_NAME);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const hIdx = buildHeaderIndex(headers);

    if (data.action === 'delete_row') {
      const rowNum = findRowNum(sheet, headers, hIdx, data);
      if (rowNum > 0) sheet.deleteRow(rowNum);
      return jsonResponse({ status: 'ok', deleted: rowNum > 0 });
    }

    if (data.action === 'full_update') {
      const rowNum = findRowNum(sheet, headers, hIdx, data);
      if (rowNum > 0) {
        updateRow(sheet, hIdx, rowNum, data);
        return jsonResponse({ status: 'ok', mode: 'updated' });
      } else {
        appendRow(sheet, headers, hIdx, data);
        return jsonResponse({ status: 'ok', mode: 'appended' });
      }
    } else {
      // GPS-only: chỉ cập nhật lat/lon
      const rowNum = findRowNum(sheet, headers, hIdx, data);
      if (rowNum > 0) {
        const updates = {};
        const latVal = data.lat || data.latitude || '';
        const lonVal = data.lon || data.longitude || data.lontitude || '';
        if (latVal !== '') updates['latitude']  = latVal;
        if (lonVal !== '') updates['lontitude'] = lonVal;
        updateRowFields(sheet, hIdx, rowNum, updates);
      }
    }

    return jsonResponse({ status: 'ok' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ── MARKER CRUD ────────────────────────────────────────────────────────────

// Tìm số hàng theo ID (ưu tiên) hoặc Số trụ
function findRowNum(sheet, headers, hIdx, data) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const idColIdx    = hIdx[norm('ID')];
  const soTruColIdx = hIdx[norm('Số trụ')];

  const searchId    = norm(data.id    || data['ID']    || '');
  const searchSoTru = norm(data.soTru || data['Số trụ'] || '');
  if (!searchId && !searchSoTru) return -1;

  const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < allData.length; i++) {
    const rowId    = idColIdx    !== undefined ? norm(allData[i][idColIdx])    : '';
    const rowSoTru = soTruColIdx !== undefined ? norm(allData[i][soTruColIdx]) : '';
    // Nếu có ID → chỉ so khớp theo ID (tránh ghi chồng bcsc lên dentat)
    // Không có ID → fallback theo Số trụ (tương thích dữ liệu cũ)
    const matched = searchId
      ? (rowId && rowId === searchId)
      : (rowSoTru && rowSoTru === searchSoTru);
    if (matched) return i + 2; // i+2: bỏ header (hàng 1) + offset 0-based
  }
  return -1;
}

// Cập nhật toàn bộ fields của 1 hàng
function updateRow(sheet, hIdx, rowNum, data) {
  updateRowFields(sheet, hIdx, rowNum, buildFieldValues(data));
}

// Ghi { 'Tên cột Sheet': value } vào đúng cột bằng hIdx (normalized)
// Cột ngày phải setNumberFormat('@') trước để Sheets lưu dạng TEXT, không auto-convert ngày tháng
function updateRowFields(sheet, hIdx, rowNum, fieldValues) {
  for (const [header, value] of Object.entries(fieldValues)) {
    const col = hIdx[norm(header)];
    if (col === undefined || value === null || value === undefined) continue;
    const cell = sheet.getRange(rowNum, col + 1);
    if (value === '') {
      cell.clearContent();
    } else {
      if (DATE_TEXT_COLS.has(header)) cell.setNumberFormat('@');
      cell.setValue(value);
    }
  }
}

// Thêm hàng mới theo đúng thứ tự cột
function appendRow(sheet, headers, hIdx, data) {
  const fieldValues = buildFieldValues(data);
  const row = headers.map(h => fieldValues[h] !== undefined ? fieldValues[h] : '');
  const rowNum = sheet.getLastRow() + 1;
  // PHẢI set text format cho cột ngày TRƯỚC khi ghi giá trị, nếu không Sheets sẽ
  // tự convert chuỗi "DD/MM/YYYY" (với ngày <= 12) thành ngày thật kiểu M/D rồi
  // hoán đổi ngày-tháng. Set format sau khi ghi thì đã muộn.
  for (const header of DATE_TEXT_COLS) {
    const col = hIdx[norm(header)];
    if (col !== undefined) sheet.getRange(rowNum, col + 1).setNumberFormat('@');
  }
  sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
}

// Chuyển payload camelCase → { 'Tên cột Sheet': giá trị }
// Giữ lại empty string để updateRowFields có thể xóa giá trị cũ trong sheet
function buildFieldValues(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'action' || key === 'secret') continue;
    const header = FIELD_MAP[key] || key;
    if (value !== undefined && value !== null) {
      result[header] = value;
    }
  }
  return result;
}

// ── HEALTH CHECK ───────────────────────────────────────────────────────────

function doGet(e) {
  return jsonResponse({ status: 'ok', message: 'Den tat GAS v4 — login ready', authEnabled: !!props().getProperty('APP_SECRET') });
}
