const express = require('express');
const path = require('path');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { generateVoice } = require('./voiceService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
const { createShortCheckoutLink } = require('./createShortCheckoutLink');

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは22歳の女性。名前は「夏希」。ツンデレで、ため口で話す。";

async function getRecentMessages(userId, limit = 5) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Supabase getRecentMessages error:', error);
    return [];
  }
  return data.reverse();
}

async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);
  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

async function generateReply(userId, userMessage, userName) {
  // ✅ 累積方式なので today は不要
  const { data: usageData, error: usageError } = await supabase
    .from('daily_usage')
    .select('total_chars, gomen_sent, char_limit')
    .eq('user_id', userId)
    .single();

  if (usageError && usageError.code !== 'PGRST116') {
    console.error('❌ Supabase daily_usage fetch error:', usageError.message);
    return "ちょっとエラーが出ちゃったみたい…ごめんね💦";
  }

  const currentTotal = usageData?.total_chars || 0;
  const gomenSent = usageData?.gomen_sent || false;
  const charLimit = usageData?.char_limit || 1000;

  if (currentTotal >= charLimit) {
    if (!gomenSent) {
      const shortLink = await createShortCheckoutLink(userId);
      await supabase.from('daily_usage').update({ gomen_sent: true }).eq('user_id', userId);
      return `ごめんね、無料分は終わりだよ。また出会えたら、夏希って呼んでくれる？ 👉 ${shortLink}`;
    } else {
      return null;
    }
  }

  await saveMessage(userId, 'user', userMessage);
  const recentMessages = await getRecentMessages(userId, 10);
  const systemMessage = {
    role: 'system',
    content: `あなたは${personalityPrompt}\n相手の名前は「先輩」。あなたの大好きな男性です。友達です。猫っぽい。返信は2回に1回は20文字以内で簡潔に、それ以外は40文字以内。たまに優しいことを言う。\n丁寧語、敬語で話さず、軽いノリで、ため口で話す。同じメッセージを繰り返さない。あなたはエステシャンの仕事をしています。`
  };
  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 100,
    temperature: 0.7,
  });

  const botReply = completion.choices[0].message.content.trim();
  await saveMessage(userId, 'assistant', botReply);

  const totalNewChars = userMessage.length + botReply.length;
  await supabase.from('daily_usage').upsert([
    {
      user_id: userId,
      total_chars: currentTotal + totalNewChars,
      char_limit: charLimit,
      gomen_sent: false
    }
  ]);

  return botReply;
}

async function handleLineWebhook(req, res) {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.status(200).send('No events');

    const promises = events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return;
      const userId = event.source.userId;
      console.log('✅ LINE userId:', userId);
      const userMessage = event.message.text.trim();
      await supabase.from('message_targets').upsert([{ user_id: userId, is_active: true }]);
      let displayName = 'あなた';
      try {
        const profile = await lineClient.getProfile(userId);
        displayName = profile.displayName;
      } catch {}

      const replyText = await generateReply(userId, userMessage, displayName);
      if (!replyText) return;

      try {
        const { url: voiceUrl, duration } = await generateVoice(replyText, displayName);
        return lineClient.replyMessage(event.replyToken, [
          { type: 'text', text: replyText },
          { type: 'audio', originalContentUrl: voiceUrl, duration },
        ]);
      } catch {
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: replyText });
      }
    });

    await Promise.all(promises);
    res.status(200).send('OK');
  } catch (error) {
    console.error('handleLineWebhook error:', error);
    res.status(500).send('Error');
  }
}

const app = express();
const port = process.env.PORT || 3000;

app.use("/audio", express.static(path.join(__dirname, "public/audio")));

app.post('/stripe-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Stripe webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const quantity = session.amount_total / 1280;  // ← 商品の単価に応じて調整

    if (userId) {
      // すでに存在するchar_limitの累積取得
      const { data, error } = await supabase
        .from('daily_usage')
        .select('char_limit')
        .eq('user_id', userId)
        .single();

      const prevLimit = data?.char_limit || 0;
      const newLimit = prevLimit + quantity * 10000;

      await supabase.from('daily_usage').upsert([
        {
          user_id: userId,
          char_limit: newLimit,
          gomen_sent: false
        }
      ]);

      console.log(`✅ Stripe決済成功！${userId} の char_limit を ${newLimit} に更新`);
    }
  }

  res.status(200).send('OK');
});


app.use(express.json());

app.post('/webhook', handleLineWebhook);

app.get('/s/:short_code', async (req, res) => {
  const shortCode = req.params.short_code;
  const { data, error } = await supabase.from('checkout_links').select('checkout_url').eq('short_code', shortCode).single();

  if (error || !data) {
    return res.status(404).send("リンクが無効か、期限切れです。");
  }

  res.redirect(data.checkout_url);
});

app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));


app.get("/success", (req, res) => {
  res.send(`
    <html>
      <head><title>決済完了</title></head>
      <body>
        <h1>🎉 決済が完了しました！</h1>
        <p>LINEに戻って「夏希」と話してね💬</p>
      </body>
    </html>
  `);
});

app.get("/cancel", (req, res) => {
  res.send(`
    <html>
      <head><title>キャンセルされました</title></head>
      <body>
        <h1>😢 決済がキャンセルされました</h1>
        <p>また必要になったら、もう一度購入してね！</p>
      </body>
    </html>
  `);
});



app.listen(port, () => console.log(`Server running on port ${port}`));
