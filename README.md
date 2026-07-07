# Kaos Kontrol Bot (Vercel / Interactions)

Discord'un HTTP Interactions modeliyle çalışır (websocket yok, tamamen serverless, Vercel ücretsiz plana uygun).

## Komutlar

- `/ticket` — Yeni bir destek talebi (ticket) kanalı açar
- `/close` — İçinde bulunulan ticket kanalını kapatır
- Bir mesaja **sağ tık → Apps → Çevir** — küçük bir pencere açılır, dil kodunu yazınca (tr, en, de...) mesajı çevirir

Ticket kategorisi ve yetkili görünürlüğü tamamen otomatik: "Tickets" kategorisi yoksa oluşturulur, Administrator izni olan roller otomatik yetkili sayılır.

## Gerekli Environment Variable'lar (Vercel)

- `DISCORD_TOKEN` — Bot token
- `DISCORD_PUBLIC_KEY` — Developer Portal > General Information > Public Key
- `DISCORD_APP_ID` — Developer Portal > General Information > Application ID
- `SETUP_SECRET` — rastgele bir şifre, sadece `/api/setup` endpoint'ini korumak için

## Deploy sonrası tek seferlik adım

1. Vercel projenin URL'sini al (örn `https://xxx.vercel.app`)
2. `https://xxx.vercel.app/api/setup?secret=<SETUP_SECRET>` adresine bir istek at (tarayıcıdan açman yeterli) — bu, `/ticket`, `/close` ve `Çevir` komutlarını Discord'a kaydeder
3. Discord Developer Portal'da botun **General Information** sayfasında **Interactions Endpoint URL** alanına `https://xxx.vercel.app/api/interactions` yaz ve kaydet (Discord buraya bir doğrulama isteği atar, endpoint otomatik cevap verir)
