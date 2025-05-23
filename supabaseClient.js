const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function saveUserName(userId, name) {
  const { error } = await supabase
    .from('user_profiles')
    .upsert([{ user_id: userId, name }], { onConflict: ['user_id'] });

  if (error) console.error(`Error saving user name for ${userId}:`, error);
}

async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('messages')
    .insert([{ user_id: userId, role, content }]);

  if (error) console.error(`Error saving message for ${userId}:`, error);
}

async function getRecentMessages(userId, limit = 5) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit * 2);

  if (error) {
    console.error(`Error fetching recent messages for ${userId}:`, error);
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
      i++; // botメッセージはスキップ
    }
  }

  return pairs;
}

module.exports = {
  supabase,
  saveUserName,
  saveMessage,
  getRecentMessages,
};
