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

  try {
    // 🔸 Step1: 音声生成リクエスト（JSON返却）
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
      }
    );

    const audioUrl = res.data.generatedVoice.audioFileUrl;
    if (!audioUrl) {
      throw new Error("🎧 audioFileUrl が取得できませんでした。");
    }

    // 🔸 Step2: audioFileUrlから音声をGETで取得
    const audioRes = await axios.get(audioUrl, {
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(audioRes.data);
    console.log("🎧 Downloaded audioBuffer size:", audioBuffer.length);

    // 🔸 Step3: Supabaseにアップロード
    const { error: uploadError } = await supabase.storage
      .from("voice-audio")
      .upload(`audio/${fileName}`, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("🔴 Supabase upload error:", uploadError.message);
      throw uploadError;
    }

    // 🔸 Step4: 公開URLを取得
    const { data: publicUrlData } = supabase.storage
      .from("voice-audio")
      .getPublicUrl(`audio/${fileName}`);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("🔴 generateVoice error:", err.message || err);
    throw err;
  }
}

module.exports = { generateVoice };
