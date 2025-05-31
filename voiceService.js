const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";
const STYLE_ID = 58;

async function generateVoice(text) {
  const fileName = `${uuidv4()}.mp3`;
  const storagePath = `audio/${fileName}`; // audio/ フォルダ付き

  try {
    // 🎯 正しい TTS API エンドポイント + パラメーター
    const response = await axios.post(
      `https://api.nijivoice.com/api/platform/v1/voice-actors/${CHARACTER_ID}/generate-voice`,
      {
        script: text,
        speed: "1.0",
        emotionalLevel: "0.1",
        soundDuration: "0.1",
        format: "mp3",
        styleId: STYLE_ID,
      },
      {
        headers: {
          "x-api-key": process.env.NIJI_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer", // 🔥 超重要：mp3バイナリで受け取る
      }
    );

    const audioBuffer = Buffer.from(response.data);

    // ⚠️ 再生できない原因：バッファサイズが小さすぎる
    if (audioBuffer.length < 1000) {
      throw new Error("生成された音声が不正です（サイズが小さすぎる）");
    }

    const { error: uploadError } = await supabase.storage
      .from("voice-audio")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("🛑 Supabase upload error:", uploadError.message);
      throw uploadError;
    }

    // 🔗 公開URLを取得
    const { data: publicData } = supabase.storage
      .from("voice-audio")
      .getPublicUrl(storagePath);

    return publicData.publicUrl;
  } catch (err) {
    console.error("🛑 Voice generation or upload error:", err.message || err);
    throw err;
  }
}

module.exports = { generateVoice };
