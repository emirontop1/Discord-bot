const { verifyKey } = require("discord-interactions");
const translate = require("google-translate-api-x");

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const API = "https://discord.com/api/v10";

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function discordFetch(path, options = {}) {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Discord API ${r.status}: ${text}`);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? r.json() : null;
}

// "Tickets" kategorisini bul, yoksa olustur
async function getOrCreateTicketCategory(guildId) {
  const channels = await discordFetch(`/guilds/${guildId}/channels`);
  let category = channels.find((c) => c.type === 4 && c.name.toLowerCase() === "tickets");
  if (!category) {
    category = await discordFetch(`/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "Tickets", type: 4 }),
    });
  }
  return category;
}

// Administrator izni olan rolleri otomatik bul (elle rol ID girmeye gerek yok)
function getAdminRoleOverwrites(roles) {
  const ADMIN_BIT = BigInt(0x8);
  return roles
    .filter((r) => !r.managed && r.name !== "@everyone" && (BigInt(r.permissions) & ADMIN_BIT) === ADMIN_BIT)
    .map((r) => ({ id: r.id, type: 0, allow: "68608" })); // VIEW+SEND+HISTORY
}

async function handleTicketCreate(interaction, res) {
  const guildId = interaction.guild_id;
  const user = interaction.member.user;
  const username = user.username.toLowerCase().replace(/[^a-z0-9-]/g, "") || user.id;

  try {
    const channels = await discordFetch(`/guilds/${guildId}/channels`);
    const existing = channels.find((c) => c.name === `ticket-${username}`);
    if (existing) {
      return res.json({
        type: 4,
        data: { content: `❌ Zaten açık bir ticketin var: <#${existing.id}>`, flags: 64 },
      });
    }

    const category = await getOrCreateTicketCategory(guildId);
    const roles = await discordFetch(`/guilds/${guildId}/roles`);
    const everyoneRole = roles.find((r) => r.name === "@everyone");

    const overwrites = [
      { id: everyoneRole.id, type: 0, deny: "1024" },
      { id: user.id, type: 1, allow: "68608" },
      ...getAdminRoleOverwrites(roles),
    ];

    const channel = await discordFetch(`/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: `ticket-${username}`,
        type: 0,
        parent_id: category.id,
        permission_overwrites: overwrites,
      }),
    });

    await discordFetch(`/channels/${channel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: `<@${user.id}> Merhaba, bir yetkili en kısa sürede sana yardımcı olacak.\nTicketi kapatmak için \`/close\` yazabilirsin.`,
      }),
    });

    return res.json({
      type: 4,
      data: { content: `✅ Ticketin oluşturuldu: <#${channel.id}>`, flags: 64 },
    });
  } catch (err) {
    console.error(err);
    return res.json({ type: 4, data: { content: "❌ Ticket oluşturulurken hata oluştu.", flags: 64 } });
  }
}

async function handleTicketClose(interaction, res) {
  const channelId = interaction.channel_id;
  try {
    const channel = await discordFetch(`/channels/${channelId}`);
    if (!channel.name || !channel.name.startsWith("ticket-")) {
      return res.json({ type: 4, data: { content: "❌ Bu komut sadece ticket kanallarında kullanılabilir.", flags: 64 } });
    }

    res.json({ type: 4, data: { content: "🔒 Ticket 3 saniye içinde kapatılıyor..." } });

    await new Promise((r) => setTimeout(r, 3000));
    await discordFetch(`/channels/${channelId}`, { method: "DELETE" }).catch(() => {});
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.json({ type: 4, data: { content: "❌ Ticket kapatılırken hata oluştu.", flags: 64 } });
    }
  }
}

function openTranslateModal(interaction, res) {
  const targetId = interaction.data.target_id;
  return res.json({
    type: 9, // MODAL
    data: {
      custom_id: `translate_${targetId}_${interaction.channel_id}`,
      title: "Çeviri",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "lang_code",
              label: "Dil kodu (tr, en, de, fr...)",
              style: 1,
              min_length: 2,
              max_length: 5,
              placeholder: "tr",
              required: true,
            },
          ],
        },
      ],
    },
  });
}

async function handleTranslateModal(interaction, res) {
  const [, messageId, channelId] = interaction.data.custom_id.split("_");
  const langCode = interaction.data.components[0].components[0].value.trim().toLowerCase();

  try {
    const original = await discordFetch(`/channels/${channelId}/messages/${messageId}`);
    if (!original.content) {
      return res.json({ type: 4, data: { content: "❌ Çevrilecek bir metin bulamadım.", flags: 64 } });
    }

    const result = await translate(original.content, { to: langCode });

    return res.json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0x5865f2,
            author: { name: original.author.username },
            description: result.text,
            footer: { text: `Çevrildi: ${langCode.toUpperCase()}` },
          },
        ],
      },
    });
  } catch (err) {
    console.error(err);
    return res.json({
      type: 4,
      data: { content: `❌ Çeviri yapılamadı. "${langCode}" geçerli bir dil kodu mu kontrol et (tr, en, de, fr, es, ru, ar, ja...).`, flags: 64 },
    });
  }
}

async function handler(req, res) {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const rawBody = await getRawBody(req);

  const isValid = verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  if (!isValid) {
    res.status(401).send("Bad request signature");
    return;
  }

  const interaction = JSON.parse(rawBody);

  // PING - Discord portal dogrulamasi icin sart
  if (interaction.type === 1) {
    res.json({ type: 1 });
    return;
  }

  // Slash komutlar + context menu komutlari
  if (interaction.type === 2) {
    if (interaction.data.type === 3) {
      // Message context menu -> "Çevir"
      openTranslateModal(interaction, res);
      return;
    }

    if (interaction.data.name === "ticket") {
      await handleTicketCreate(interaction, res);
      return;
    }

    if (interaction.data.name === "close") {
      await handleTicketClose(interaction, res);
      return;
    }
  }

  // Modal submit -> ceviri dil kodu girildi
  if (interaction.type === 5 && interaction.data.custom_id.startsWith("translate_")) {
    await handleTranslateModal(interaction, res);
    return;
  }

  res.status(400).send("Unknown interaction");
}

module.exports = handler;
// Bu olmadan Vercel body'yi otomatik parse eder ve imza dogrulamasi bozulur
module.exports.config = { api: { bodyParser: false } };
