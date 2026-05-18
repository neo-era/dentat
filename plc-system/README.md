# PLC LOGO! 230RCE — Hệ thống điều khiển tập trung qua 4G

Hệ điều khiển nhiều trạm PLC LOGO! 8 (0BA8) phân tán, mỗi trạm kết nối internet qua 4G/WiFi, đẩy dữ liệu về **server trung tâm self-host**, người dùng truy cập qua web/PWA.

```
┌──────────────────┐   Modbus TCP   ┌────────────────────┐   MQTT/TLS   ┌──────────────────────┐   HTTPS+WS   ┌─────────────┐
│ LOGO! 230RCE 0BA8│ ←────────────→ │ Gateway (RasPi 4G) │ ←──────────→ │ Server (VPS Docker)  │ ←──────────→ │ Web/PWA UI  │
│  Đèn / Contactor │     LAN nội bộ  │  gateway.js         │              │  MQTT + REST + DB    │              │ plc.html    │
└──────────────────┘                 └────────────────────┘              └──────────────────────┘              └─────────────┘
   tại mỗi trạm                        tại mỗi trạm                          1 VPS cho toàn bộ                    điện thoại / PC
```

## Thành phần

| Thư mục | Chạy ở đâu | Vai trò |
|---------|------------|---------|
| `gateway/` | Raspberry Pi tại mỗi trạm | Đọc/ghi PLC qua Modbus TCP, đồng bộ với server qua MQTT |
| `server/` | VPS / máy chủ trung tâm | MQTT broker + REST API + WebSocket + DB + Auth |
| `server/public/plc.html` | Browser người dùng | UI điều khiển + dashboard |

## Quick start — Server (VPS)

```bash
# Trên VPS Ubuntu/Debian — cài Docker + Compose trước
cd plc-system
cp server/.env.example server/.env
# Sửa server/.env: JWT_SECRET, ADMIN_USER, ADMIN_PASS, MQTT_USER, MQTT_PASS
docker compose up -d

# Mở https://<vps-ip>:8443 (sau khi config reverse proxy + TLS)
# Hoặc trực tiếp http://<vps-ip>:8080 để test
```

Đầu tiên đăng nhập bằng `ADMIN_USER/ADMIN_PASS` trong `.env`, vào tab **Trạm** để tạo trạm + sinh mã `stationId` + `gatewayToken` cho gateway.

## Quick start — Gateway (RasPi tại trạm)

```bash
# RasPi Zero 2W / Pi 4 / mini PC — cần Node.js 20+ và USB 4G dongle (Huawei E3372/E8372)
# 4G dongle hoạt động ở chế độ "stick mode" — RasPi tự nhận như Ethernet usb0

cd plc-system/gateway
npm install
cp config.example.json config.json
# Sửa config.json: stationId, gatewayToken (lấy từ server), mqttUrl, plc.ip
node gateway.js

# Setup systemd để tự khởi động
sudo cp systemd/plc-gateway.service /etc/systemd/system/
sudo systemctl enable --now plc-gateway
```

## Cấu hình PLC LOGO! 8

Trong **LOGO! Soft Comfort**:

1. **Tools → Transfer → Configure Modbus Slave** → Enable.
2. Slave ID: `1` (mặc định, có thể đổi).
3. Trong chương trình, dùng block **Network Input/Output** để map các biến cần đồng bộ vào vùng Modbus.
4. Cài đặt IP tĩnh cho PLC (vd `192.168.0.10`), gateway/router LAN.
5. Đảm bảo gateway (RasPi) ping được PLC qua LAN nội bộ.

**Mapping địa chỉ LOGO! ↔ Modbus** (chuẩn Siemens):

| LOGO! | Modbus area | Address | FC đọc | FC ghi |
|-------|-------------|---------|--------|--------|
| `I1`..`I24` | Discrete Input | 0..23 | 02 | — |
| `Q1`..`Q20` | Coil | 8192..8211 | 01 | 05 |
| `M1`..`M64` | Coil | 8256..8319 | 01 | 05 |
| `VW0`..`VWn` | Holding Register | 0..n/2 | 03 | 06 |
| `AI1`..`AI8` | Input Register | 1..8 | 04 | — |
| `AQ1`..`AQ8` | Holding Register | 513..520 | 03 | 06 |

## Bảo mật

- **MQTT**: bật TLS (port 8883), auth bằng `username/password` (Aedes built-in). Mỗi gateway 1 token riêng.
- **REST API**: HTTPS bắt buộc qua reverse proxy (Caddy/Nginx + Let's Encrypt). JWT cho user, gateway token cho thiết bị.
- **PLC**: PLC chỉ phơi ra LAN nội bộ tại trạm, **không bao giờ** port-forward ra internet.
- **Gateway**: chạy như non-root user, ACL chặt MQTT topic theo `stationId`.

Chi tiết: xem `docs/architecture.md` và `docs/security.md`.

## Mở rộng

- **>500 trạm**: thay Aedes bằng EMQX/Mosquitto cluster, SQLite → PostgreSQL + TimescaleDB cho time-series.
- **Phân quyền theo quận/phường**: thêm cột `region_id` vào `users` và `stations`, lọc API theo region của user.
- **Log dài hạn**: tách bảng `events` ra DB time-series (InfluxDB), giữ SQLite cho state hiện tại.
- **Tích hợp với dentat.html**: server expose endpoint `/api/stations/:id/state` cho dentat đọc trạng thái đèn realtime, hiển thị trên bản đồ.
