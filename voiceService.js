const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
//水瀬 玲奈
//const CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";
//const STYLE_ID = 58;//素直

//ラピス
//const CHARACTER_ID = "47abf5ad-5336-4ace-9254-c145590a9576";
//const STYLE_ID = 52;//甘え

//高宮 涼香
const CHARACTER_ID = "294eeefe-f46c-45a6-9e5a-e6a3b3d6eb6e";
const STYLE_ID = 25;//優しい

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
      .getPublicUrl(`${fileName}`);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("🔴 generateVoice error:", err.message || err);
    throw err;
  }
}

module.exports = { generateVoice };
