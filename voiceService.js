const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";
const STYLE_ID = 58;

async function generateVoice(text) {
  const fileName = `${uuidv4()}.mp3`;

  try {
    const res = await axios.post(
      `https://api.nijivoice.com/api/platform/v1/voice-actors/${CHARACTER_ID}/generate-voice`,
      {
        script: text,
        speed: "1.0",
        emotionalLevel: "0.1",
        soundDuration: "0.1",
        format: "mp3",
        style_id: STYLE_ID,
      },
      {
        headers: {
          "x-api-key": process.env.NIJI_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer", // ✅ ここ重要！
      }
    );

    const audioBuffer = Buffer.from(res.data);

    const { data, error } = await supabase.storage
      .from('voice-audio')
      .upload(`audio/${fileName}`, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (error) {
      console.error("🔴 Supabase upload error:", error.message);
      throw error;
    }

    // ✅ 公開URL生成
    const { data: publicUrlData } = supabase.storage
      .from('voice-audio')
      .getPublicUrl(`audio/${fileName}`);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("🔴 Voice generation or upload error:", err.message || err);
    throw err;
  }
}

module.exports = { generateVoice };
