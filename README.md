# Lua Toolkit + Discord Bot

Bu repo iki farklı şeyi barındırıyor:

## 1. Discord Bot (`/api`)
Ticket sistemi + reply ile çeviri yapan Discord botu, Vercel serverless (Discord Interactions modeli) üzerinde çalışır. Detaylar için bkz. aşağıdaki "Discord Bot" bölümü.

## 2. Lua Toolkit (statik site — `/`, `/compiler`, `/deobfuscator`, `/jsUtils`)
Tarayıcıda çalışan Lua/Luau araçları. Build adımı yok, tamamen statik HTML/JS. Hem **GitHub Pages** hem **Vercel** (aynı repo, otomatik) üzerinden servis edilir.

- **`/deobfuscator`** — WeAreDevs Obfuscator ile şifrelenmiş scriptleri gerçek bir Lua yorumlayıcısında (Fengari) güvenli bir sandbox'ta çalıştırıp çağrılan fonksiyonları okunabilir hale getirir. `loadstring` içeriğini de yakalar. **Not:** Bu dinamik analizdir — VM'e gömülü kontrol akışını/değişken isimlerini birebir geri getirmez (bu, ayrı ve çok daha büyük bir "gerçek decompiler" projesi olurdu).
- **`/compiler`** — Lua kodundaki string ve sayı sabitlerini şifreler (obfuscate), isteğe bağlı junk kod ekler. Değişken yeniden adlandırma YOK (güvenli scope analizi olmadan riskli).
- **`/jsUtils`** — İkisinin de kullandığı ortak Lua tokenize/maskeleme yardımcıları (`luaLexer.js`).

### GitHub Pages Kurulumu
Settings → Pages → Source: Deploy from a branch → Branch: `main`, klasör: `/` (root).

---

## Discord Bot Detayları

Ticket/destek sistemi + reply ile çeviri yapan Discord botu.

### Komutlar
- `!setup-ticket`, `!ticket`, `!close`
- Bir mesaja **reply** atıp `!<dilkodu>` yazmak (örn. `!tr`, `!en`) — reply attığın mesajı o dile çevirir

### Environment Variable'lar (Vercel)
- `DISCORD_TOKEN`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_APP_ID`
- `SETUP_SECRET`

### Deploy sonrası tek seferlik adım
1. `https://<proje>.vercel.app/api/setup?secret=<SETUP_SECRET>` adresini bir kez aç (komutları Discord'a kaydeder)
2. Discord Developer Portal'da **Interactions Endpoint URL**'i `https://<proje>.vercel.app/api/interactions` yap
