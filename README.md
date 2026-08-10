# 🚨 GMGN Volume Tracker Bot

Bot pemantau volume trading 1-menit real-time untuk token di tiga chain GMGN (**Solana**, **BNB Smart Chain**, dan **Robinhood Chain**) dengan notifikasi alert ke Telegram.

---

## 📌 Fitur Utama

- ⚡ **Real-time Scanning**: Memantau volume 1m token aktif setiap 5 detik secara terisolasi per chain.
- 🔔 **Telegram Notifications**: Notifikasi instan dengan detail lengkap:
  - Nama & Symbol Token
  - **Contract Address (CA)** — Monospaced format (klik 1x langsung tersalin ke clipboard)
  - Volume (1m) USD
  - Harga Token USD
  - Market Cap USD
  - Total Fees (1m) dalam mata uang native chain (`SOL`, `BNB`, `ETH`)
  - Timestamp terdeteksi (WIB)
- ⚙️ **Konfigurasi In-Memory via Telegram**:
  - `/setthreshold <chain> <amount>` — Atur threshold volume per chain (`sol`, `bsc`, `robinhood`)
  - `/setcooldown <menit>` — Atur durasi cooldown per token
  - `/status` — Cek status scanner, last scan time, & statistik cooldown
  - `/pause` & `/resume` — Kontrol scanner sementara
- 🛡 **Security & Cloudflare Protection**:
  - Pengirim diproteksi hanya untuk `TELEGRAM_CHAT_ID` / pengguna berwenang.
  - Integrasi resmi `gmgn-cli` untuk menangani otentikasi API & melewati proteksi Cloudflare anti-bot GMGN.
- 🚀 **Zero-DB Lightweight Architecture**: State disimpan *in-memory* di dalam Node.js process, di-manage menggunakan PM2 untuk auto-restart.

---

## 🛠 Tech Stack

- **Runtime**: Node.js & TypeScript
- **Telegram Library**: Telegraf (Mode Long Polling & Auto Command Menu)
- **Data Source**: GMGN OpenAPI via `gmgn-cli`
- **Process Manager**: PM2

---

## ⚙️ Persyaratan System

- **Node.js**: `v18.0.0` atau versi lebih baru
- **PM2** (Opsional untuk VPS production): `npm install -g pm2`

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Clone & Install Dependencies

```bash
cd tracker-volume
npm install
```

### 2. Konfigurasi Environment (`.env`)

Salin file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Buka file `.env` dan isi variabel berikut:

```env
# Kredensial Telegram Bot
TELEGRAM_BOT_TOKEN=token_bot_telegram_anda
TELEGRAM_CHAT_ID=chat_id_telegram_anda

# Key GMGN OpenAPI (Dapatkan dari gmgn.ai/ai)
GMGN_PRIVATE_KEY=gmgn_key_anda

# Interval Scanning (dalam milidetik, default 5000ms)
POLL_INTERVAL_MS=5000
```

### 3. Mode Development

Jalankan bot dalam mode pengembangan (live reload via `ts-node`):

```bash
npm run dev
```

### 4. Build & Run Production

Kompilasi TypeScript ke JavaScript (`dist/`):

```bash
npm run build
npm start
```

### 5. Deployment di VPS dengan PM2

Gunakan PM2 agar bot berjalan 24/7 di VPS dan otomatis restart jika server reboot:

```bash
# Kompilasi project
npm run build

# Jalankan dengan PM2
pm2 start ecosystem.config.js

# Simpan konfigurasi PM2 startup
pm2 save
pm2 startup
```

---

## 🤖 Perintah Bot Telegram

Daftar perintah berikut akan otomatis terdaftar di menu autocomplete Telegram saat bot pertama kali diluncurkan:

| Command | Parameter | Deskripsi | Default |
|---|---|---|---|
| `/status` | - | Tampilkan status bot, last scan per chain, & statistik age filter | - |
| `/threshold` | - | Lihat threshold volume 1m aktif semua chain | - |
| `/setthreshold` | `<chain> <amount>` | Set threshold volume 1m (`sol`, `bsc`, `robinhood`) | `$50.000` |
| `/age` | - | Lihat filter umur token (min/max age) aktif per chain | - |
| `/setmaxage` | `<chain> <durasi>` | Set batas umur maksimal token (`30m`, `1h`, `6h`, `2d`, atau `off`) | `Off` |
| `/setminage` | `<chain> <durasi>` | Set batas umur minimal token (`5m`, `10m`, `1h`, atau `off`) | `Off` |
| `/cooldown` | - | Lihat durasi cooldown aktif | - |
| `/setcooldown` | `<menit>` | Set durasi cooldown notifikasi per token | `5 menit` |
| `/pause` | - | Hentikan sementara scanning & notifikasi | - |
| `/resume` | - | Dilanjutkan kembali scanning & notifikasi | - |
| `/help` | - | Tampilkan panduan perintah bot | - |

---

## 📄 Lisensi

ISC License &copy; 2026 Ryan Rafilianto
