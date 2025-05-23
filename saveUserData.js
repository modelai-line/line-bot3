const supabase = require('./supabaseClient');

async function saveUserName(userId, name) {
  await supabase.from('user_profiles').upsert([{ user_id: userId, name }]);
}

async function saveMessage(userId, role, content) {
  await supabase.from('messages').insert([{ user_id: userId, role, content }]);
}

// 🆕 過去のメッセージを取得（user + bot をペアにする）
async function getRecentMessages(userId, limit = 5) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit * 2); // user/botペアでlimit件分

  if (error || !data) {
    console.error('getRecentMessages error:', error);
    return [];
  }

  // roleごとに分割
  const reversed = data.reverse(); // 古い順に並び替え
  const pairs = [];

  for (let i = 0; i < reversed.length - 1; i++) {
    if (reversed[i].role === 'user' && reversed[i + 1].role === 'bot') {
      pairs.push({
        user_message: reversed[i].content,
        bot_response: reversed[i + 1].content,
      });
      i++; // 次のbotはスキップ
    }
  }

  return pairs;
}

module.exports = {
  saveUserName,
  saveMessage,
  getRecentMessages, // ← これを必ずエクスポート！
};
