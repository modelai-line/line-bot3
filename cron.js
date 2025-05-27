//メッセージ送信対象を取得（例: 全ユーザー、または特定条件のユーザー）

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const lineEndpoint = 'https://api.line.me/v2/bot/message/push';
const lineToken = process.env.CHANNEL_ACCESS_TOKEN;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// メッセージ送信対象を取得（例: 全ユーザー、または特定条件のユーザー）
async function fetchUsersToMessage() {
  const { data, error } = await supabase
    .from('users') // 適宜テーブル名を調整
    .select('line_user_id');

  if (error) {
    console.error('ユーザー取得エラー:', error);
    return [];
  }

  return data.map(user => user.line_user_id);
}

// LINEメッセージを送信
async function sendMessage(userId, text) {
  const res = await fetch(lineEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lineToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    console.error(`送信失敗: ${userId}`, await res.text());
  }
}

// メイン処理
(async () => {
  const users = await fetchUsersToMessage();
  for (const userId of users) {
    await sendMessage(userId, 'おはよう☀️ 今日もよろしくね！');
  }
})();
