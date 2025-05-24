const express = require('express');
const { handleLineWebhook } = require('./line.js');  // 追加

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());  // bodyParserはexpress.jsonで代替可能

app.post('/webhook', handleLineWebhook);

app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
