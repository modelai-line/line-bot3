const axios = require('axios');

const NIJI_API_KEY = process.env.NIJI_API_KEY;
const API_URL = 'https://api.nijivoice.com/api/v1/voice-actors';

async function getVoiceActors() {
  try {
    const res = await axios.get(API_URL, {
      headers: {
        Authorization: `Bearer ${NIJI_API_KEY}`,
      },
    });

    console.log("🎤 にじボイスキャラクター一覧:");
    res.data.forEach(actor => {
      console.log(`ID: ${actor.id}, Name: ${actor.name}`);
    });
  } catch (err) {
    console.error('❌ キャラクター取得エラー:', err.message);
  }
}

getVoiceActors();
