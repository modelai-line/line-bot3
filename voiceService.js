const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// 環境変数に BASE_URL をRenderで追加しておくと便利
const NIJI_API_KEY = process.env.NIJI_API_KEY;
const BASE_URL = process.env.BASE_URL || "https://line-bot3.onrender.com";
const API_URL = "https://api.nijivoice.com/api/v1/tts";
// キャラクターID 水瀬 玲奈
const DEFAULT_CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";

async function generateVoice(text) {
  const voiceId = uuidv4();
  const fileName = `${voiceId}.mp3`;
  const outputPath = path.join(__dirname, "public", "audio", fileName);

  const res = await axios.post(
    API_URL,
    {
      character_id: DEFAULT_CHARACTER_ID,
      text: text,
      speed: 1.0,
    },
    {
      headers: {
        Authorization: `Bearer ${NIJI_API_KEY}`,
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
}

module.exports = { generateVoice };
