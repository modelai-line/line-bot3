const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// 環境変数から取得（Renderに登録されている）
const NIJI_API_KEY = process.env.NIJI_API_KEY;
const API_URL = "https://api.nijivoice.com/api/v1/tts";
const DEFAULT_CHARACTER_ID = "1";

async function generateVoice(text) {
  const voiceId = uuidv4();
  const outputPath = path.join(__dirname, "public", "audio", `${voiceId}.mp3`);

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

  return `/audio/${voiceId}.mp3`;
}

module.exports = { generateVoice };
