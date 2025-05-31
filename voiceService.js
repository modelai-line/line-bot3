const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Supabase初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔵 キャラクター設定

// 水瀬 玲奈
// const CHARACTER_ID = "75ad89de-03df-419f-96f0-02c061609d49";
// const STYLE_ID = 58; // 素直

// ラピス
//const CHARACTER_ID = "47abf5ad-5336-4ace-9254-c145590a9576";
//const STYLE_ID = 52; // 甘え

// 高宮 涼香
//const CHARACTER_ID = "294eeefe-f46c-45a6-9e5a-e6a3b3d6eb6e";
//const STYLE_ID = 25; // 優しい

// 高槻 リコ
//const CHARACTER_ID = "8c08fd5b-b3eb-4294-b102-a1da00f09c72";
//const STYLE_ID = 63; // 軽快

// 春玲
//const CHARACTER_ID = "afd7df65-0fdc-4d31-ae8b-a29f0f5eed62";
//const STYLE_ID = 4; // 優しい

// 深沢 美咲
const CHARACTER_ID = "44339aa4-1bbc-4242-acd2-d8912866192f";
const STYLE_ID = 4; // お姉さん

// 🔧 ファイル名を「YYYYMMDD-HHMM-ユーザー名.mp3」形式にする
function formatFileName(userName) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0"); // ⏱ 秒を追加
  const safeUserName = userName.replace(/[^\w\-]/g, "_");
  return `${yyyy}${mm}${dd}-${hh}${min}${sec}-${safeUserName}.mp3`;
}


// 🔊 音声生成関数
async function generateVoice(text, userName = "user") {
  const fileName = formatFileName(userName);
  const estimatedDuration = Math.min(Math.ceil(text.length * 120), 15000); // 最大15秒

  try {
    // Step 1: にじボイスAPIへリクエスト
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

    const audioUrl = res.data.generatedVoice?.audioFileUrl;
    if (!audioUrl) throw new Error("🎧 audioFileUrl が取得できませんでした。");

    // Step 2: 音声データを取得
    const audioRes = await axios.get(audioUrl, { responseType: "arraybuffer" });
    const audioBuffer = Buffer.from(audioRes.data);
    console.log("🎧 Downloaded audioBuffer size:", audioBuffer.length);

    // Step 3: Supabaseにアップロード
    const { error: uploadError } = await supabase.storage
      .from("voice-audio")
      .upload(fileName, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("🔴 Supabase upload error:", uploadError.message);
      throw uploadError;
    }

    // Step 4: 公開URLを取得
    const { data: publicUrlData } = supabase.storage
      .from("voice-audio")
      .getPublicUrl(fileName);

    return {
      url: publicUrlData.publicUrl,
      duration: estimatedDuration,
    };
  } catch (err) {
    console.error("🔴 generateVoice error:", err.message || err);
    throw err;
  }
}

module.exports = { generateVoice };
