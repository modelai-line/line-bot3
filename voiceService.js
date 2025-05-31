const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const NIJI_API_KEY = process.env.NIJI_API_KEY;
const BASE_URL = process.env.BASE_URL || "https://line-bot3.onrender.com";

// 水瀬 玲奈 のキャラIDとスタイルID（例：素直）
const CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";
const STYLE_ID = 58; // ← style_id は必須！

async function generateVoice(text) {
  const voiceId = uuidv4();
  const fileName = `${voiceId}.mp3`;
  const outputDir = path.join(__dirname, "public", "audio");
  const outputPath = path.join(outputDir, fileName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const res = await axios.post(
      `https://api.nijivoice.com/api/platform/v1/voice-actors/${CHARACTER_ID}/generate-voice`,
      {
        text,
        format: "mp3",
        style_id: STYLE_ID,           // ✅ 必須パラメータ
        speed: 0.9,                   // 推奨値
        emotional_level: 0.1,         // 推奨値
        sound_duration: 0.1           // 推奨値
      },
      {
        headers: {
          "x-api-key": NIJI_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "stream",
      }
    );

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      res.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    return `${BASE_URL}/audio/${fileName}`;
  } catch (error) {
    console.error("🔊 Voice generation error:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { generateVoice };
