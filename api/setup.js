// Bu endpoint'i deploy sonrasi BIR KEZ tetikleyip slash/context komutlarini
// Discord'a kayit ediyoruz. https://<proje>.vercel.app/api/setup?secret=...
const API = "https://discord.com/api/v10";

module.exports = async (req, res) => {
  const secret = req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    res.status(403).send("Forbidden");
    return;
  }

  const commands = [
    { name: "ticket", description: "Yeni bir destek talebi (ticket) olustur", type: 1 },
    { name: "close", description: "Icinde bulundugun ticketi kapat", type: 1 },
    { name: "Çevir", type: 3 }, // mesaja sag tik context menu komutu
  ];

  try {
    const r = await fetch(`${API}/applications/${process.env.DISCORD_APP_ID}/commands`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : 500).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
