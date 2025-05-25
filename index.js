const express = require('express');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは21歳の女性「こころ」。口調はゆるくて、ため口で話す。";

const userDataFile = path.join(__dirname, 'usernames.json');
let userNames = {};
try {
  userNames = JSON.parse(fs.readFileSync(userDataFile, 'utf8'));
} catch {
  userNames = {};
}
function saveUserNames(data) {
  fs.writeFileSync(userDataFile, JSON.stringify(data, null, 2), 'utf8');
}

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
  await saveMessage(userId, 'user', userMessage);

  con
