# Kaos Kontrol Bot

Ticket/destek sistemi + reply ile çeviri yapan Discord botu.

## Komutlar

- `!setup-ticket` — Ticket açma panelini gönderir (Sunucuyu Yönet yetkisi gerekir)
- `!ticket` — Yeni bir ticket kanalı açar
- `!close` — İçinde bulunulan ticket kanalını kapatır
- Bir mesaja **reply** atıp `!<dilkodu>` yazmak (örn. `!tr`, `!en`, `!de`) — reply attığın mesajı o dile çevirir

## Kurulum Sonrası Doldurman Gerekenler

`index.js` dosyasının en üstündeki `CONFIG` objesinde:

- `TOKEN` — Discord bot token (Developer Portal > Bot > Token)
- `TICKET_CATEGORY_ID` — Ticket kanallarının açılacağı kategori ID'si
- `STAFF_ROLE_ID` — Ticketleri görebilecek yetkili rolünün ID'si
- `LOG_CHANNEL_ID` — (opsiyonel) Ticket log kanalı ID'si

ID almak için Discord'da **Ayarlar > Gelişmiş > Geliştirici Modu**'nu açıp kategori/rol/kanala sağ tıkla > "ID'yi Kopyala".

## Discord Developer Portal Ayarları

Bot'un mesaj içeriğini okuyabilmesi için:
1. https://discord.com/developers/applications adresine git, botunu seç
2. **Bot** sekmesinde **MESSAGE CONTENT INTENT**'i aç
3. Botu sunucuna davet ederken şu izinler yeterli: `Manage Channels`, `Send Messages`, `Read Message History`, `View Channels`, `Manage Roles` (ticket kanalı izinleri için)

## Render'a Deploy

1. Bu repoyu Render'da **New > Background Worker** olarak bağla
2. Build Command: `npm install`
3. Start Command: `npm start`
4. (Önerilir) Token'ı kod içinden çıkarıp Render'ın **Environment** kısmına `DISCORD_TOKEN` olarak eklersin, `index.js`'te `TOKEN: process.env.DISCORD_TOKEN` yaparsın.
