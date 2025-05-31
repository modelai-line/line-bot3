// ✅ Supabase Storage を使った音声保存版
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const NIJI_API_KEY = process.env.NIJI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET_NAME = "voice-audio";
const CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";
const STYLE_ID = 58; // 例："素直"

async function generateVoice(text) {
  const fileName = `${uuidv4()}.mp3`;

  try {
    const res = await axios.post(
      `https://api.nijivoice.com/api/platform/v1/voice-actors/${CHARACTER_ID}/generate-voice`,
      {
        script: text,
        speed: "0.9",
        emotionalLevel: "0.1",
        soundDuration: "0.1",
        format: "mp3",
        style_id: STYLE_ID
      },
      {
        headers: {
          "x-api-key": NIJI_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    const uploadRes = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, res.data, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadRes.error) {
      throw uploadRes.error;
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
    return data.publicUrl;
  } catch (error) {
    console.error("🔊 Voice generation or upload error:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { generateVoice };
