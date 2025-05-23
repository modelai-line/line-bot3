const supabase = require('./supabaseClient');

async function saveUserName(userId, name) {
  const { error } = await supabase.from('user_profiles').upsert([{ user_id: userId, name }]);
  if (error) {
    console.error('Error in saveUserName:', error);
    throw error; // エラーを外に投げて、呼び出し元で気づけるようにする
  }
}

async function saveMessage(userId, role, content) {
  const { error } = await supabase.from('messages').insert([{ user_id: userId, role, content }]);
  if (error) {
    console.error('Error in saveMessage:', error);
    throw error;
  }
}

async function getRecentMessages(userId, limit = 5) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit * 2);

  if (error || !data) {
    console.error('getRecentMessages error:', error);
    return [];
  }

  const reversed = data.reverse();
  const pairs = [];

  for (let i = 0; i < reversed.length - 1; i++) {
    if (reversed[i].role === 'user' && reversed[i + 1].role === 'bot') {
      pairs.push({
        user_message: reversed[i].content,
        bot_response: reversed[i + 1].content,
      });
      i++;
    }
  }

  return pairs;
}

module.exports = {
  saveUserName,
  saveMessage,
  getRecentMessages,
};
