const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Supabase初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔵 キャラクター設定
// ラピス
const CHARACTER_ID = "47abf5ad-5336-4ace-9254-c145590a9576";
const STYLE_ID = 52; // 甘え

// ロザリア・ガーネット
// const CHARACTER_ID = "f9ce50d1-2d89-415b-8045-49a78765fc98";
// const STYLE_ID = 164; // 内向的

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
