// ==================== KAOS KONTROL BOT ====================
// Ticket/Destek Sistemi + Reply ile Çeviri
// =============================================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");
const translate = require("google-translate-api-x");
const express = require("express");
require("dotenv").config();

// ==================== KEEP-ALIVE SUNUCU ====================
// Render'ın ücretsiz Web Service planı botu ayakta tutabilmemiz için
// HTTP isteği bekliyor. Dışarıdan (UptimeRobot vb.) buraya periyodik
// ping atılırsa Render botu asla uyutmaz.
const app = express();
app.get("/", (req, res) => {
  res.send(`Bot çalışıyor: ${client.user ? client.user.tag : "başlatılıyor..."}`);
});
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Keep-alive sunucusu ayakta.");
});

// ==================== AYARLAR (CONFIG) ====================
// Token repo public olabileceği için env variable'dan okunuyor (güvenlik).
// Lokalde test için: .env dosyası oluşturup içine DISCORD_TOKEN=... yaz.
// Render'da: Environment sekmesinden DISCORD_TOKEN adında bir variable ekle.
const CONFIG = {
  TOKEN: process.env.DISCORD_TOKEN,
  PREFIX: "!", // Komut ön eki (örn: !ticket, !close, !tr)
  LOG_CHANNEL_ID: "", // (opsiyonel) Ticket log kanalı - boş bırakılabilir
};
// =============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("ready", () => {
  console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);
});

// ==================== TICKET SİSTEMİ ====================

// !setup-ticket -> ticket açma paneli gönderir (yetkili kullanır)
async function sendTicketPanel(message) {
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return message.reply("❌ Bu komutu kullanmak için yetkin yok.");
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Destek Sistemi")
    .setDescription("Yardıma mı ihtiyacın var? Aşağıdaki butona tıklayarak bir destek talebi (ticket) oluşturabilirsin.")
    .setColor(0x2b2d31);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_ticket")
      .setLabel("Ticket Aç")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({ embeds: [embed], components: [row] });
}

// Sunucuda "Tickets" adında bir kategori var mı bak, yoksa oluştur
async function getOrCreateTicketCategory(guild) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === "tickets"
  );
  if (!category) {
    category = await guild.channels.create({
      name: "Tickets",
      type: ChannelType.GuildCategory,
    });
  }
  return category;
}

// Yönetici (Administrator) iznine sahip rolleri otomatik bul -> ticketleri onlar da görsün
function getStaffOverwrites(guild) {
  const overwrites = [];
  guild.roles.cache.forEach((role) => {
    if (!role.managed && role.id !== guild.roles.everyone.id && role.permissions.has(PermissionsBitField.Flags.Administrator)) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }
  });
  return overwrites;
}

// Yeni ticket kanalı oluştur
async function createTicket(interactionOrMessage, user, guild) {
  const existing = guild.channels.cache.find(
    (c) => c.name === `ticket-${user.username.toLowerCase()}`
  );
  if (existing) {
    return { error: `Zaten açık bir ticketin var: ${existing}` };
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    ...getStaffOverwrites(guild),
  ];

  const category = await getOrCreateTicketCategory(guild);

  const channel = await guild.channels.create({
    name: `ticket-${user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
  });

  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket Açıldı")
    .setDescription(`Merhaba ${user}, bir yetkili en kısa sürede sana yardımcı olacak.\nTicketi kapatmak için \`${CONFIG.PREFIX}close\` yazabilirsin.`)
    .setColor(0x57f287);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });

  if (CONFIG.LOG_CHANNEL_ID) {
    const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logChannel) {
      logChannel.send(`📥 ${user.tag} yeni bir ticket açtı: ${channel}`);
    }
  }

  return { channel };
}

// Ticket kapatma
async function closeTicket(channel, closedBy) {
  if (!channel.name.startsWith("ticket-")) {
    return { error: "Bu komut sadece ticket kanallarında kullanılabilir." };
  }

  if (CONFIG.LOG_CHANNEL_ID) {
    const logChannel = channel.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logChannel) {
      logChannel.send(`📤 ${closedBy.tag} #${channel.name} ticketini kapattı.`);
    }
  }

  await channel.send("🔒 Ticket 5 saniye içinde kapatılıyor...");
  setTimeout(() => channel.delete().catch(() => {}), 5000);
  return { success: true };
}

// ==================== ÇEVİRİ SİSTEMİ ====================
// Kullanım: Bir mesaja reply atıp "!<dilKodu>" yaz (örn: !tr, !en, !de)
// -> Reply attığın mesaj o dile çevrilir.

async function handleTranslate(message, langCode) {
  if (!message.reference) return; // reply değilse yoksay

  try {
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
    if (!repliedMessage.content) {
      return message.reply("❌ Çevrilecek bir metin bulamadım (mesaj boş veya sadece embed/dosya içeriyor).");
    }

    const result = await translate(repliedMessage.content, { to: langCode });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: repliedMessage.author.tag,
        iconURL: repliedMessage.author.displayAvatarURL(),
      })
      .setDescription(result.text)
      .setFooter({ text: `Çevrildi: ${langCode.toUpperCase()}` });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error("Çeviri hatası:", err);
    await message.reply(`❌ Çeviri yapılamadı. "${langCode}" geçerli bir dil kodu mu kontrol et (örn: tr, en, de, fr, es, ru, ar, ja).`);
  }
}

// ==================== MESAJ DİNLEYİCİSİ ====================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(CONFIG.PREFIX)) return;

  const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // ---- Ticket komutları ----
  if (command === "setup-ticket") {
    return sendTicketPanel(message);
  }

  if (command === "ticket") {
    const { error, channel } = await createTicket(message, message.author, message.guild);
    if (error) return message.reply(`❌ ${error}`);
    return message.reply(`✅ Ticketin oluşturuldu: ${channel}`);
  }

  if (command === "close") {
    const { error } = await closeTicket(message.channel, message.author);
    if (error) return message.reply(`❌ ${error}`);
    return;
  }

  // ---- Çeviri komutu ----
  // Reply + "!<dilkodu>" formatı: örn !tr, !en, !de
  // Bilinen ticket komutlarından biri değilse ve reply ise, çeviri komutu olarak dene
  if (message.reference && /^[a-z]{2}(-[a-z]{2})?$/i.test(command)) {
    return handleTranslate(message, command.toLowerCase());
  }
});

// ==================== BUTON ETKİLEŞİMLERİ ====================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "create_ticket") {
    await interaction.deferReply({ ephemeral: true });
    const { error, channel } = await createTicket(interaction, interaction.user, interaction.guild);
    if (error) return interaction.editReply(`❌ ${error}`);
    return interaction.editReply(`✅ Ticketin oluşturuldu: ${channel}`);
  }

  if (interaction.customId === "close_ticket") {
    await interaction.deferReply();
    const { error } = await closeTicket(interaction.channel, interaction.user);
    if (error) return interaction.editReply(`❌ ${error}`);
    return interaction.editReply("🔒 Ticket kapatılıyor...");
  }
});

if (!CONFIG.TOKEN) {
  console.error("❌ DISCORD_TOKEN bulunamadı. .env dosyasına veya Render Environment ayarlarına ekle.");
  process.exit(1);
}

client.login(CONFIG.TOKEN);
