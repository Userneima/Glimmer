(async () => {
  const endpoint = (process.env.DS_BASE_URL || 'https://api.deepseek.com') + '/v1/chat/completions';
  const key = process.env.DS_KEY;
  const text = process.env.DIARY_TEXT || '';
  if (!key) {
    console.error('No DS_KEY provided (set env DS_KEY)');
    process.exit(2);
  }

  const systemPrompt = `你是一个中文日记分析助理。收到用户的日记后，生成一个 JSON 对象：{"summary":"...","suggestions":["..."],"tags":["..."]}。不要额外输出其他文本，尽量只返回该 JSON。`;
  const userPrompt = `请用中文对以下日记内容做分析：\n\n${text}\n\n请返回 JSON 对象格式：{"summary":"...","suggestions":["..."],"tags":["..."]}`;

  const payload = {
    model: process.env.DS_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 512,
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('HTTP status:', res.status);
    const textBody = await res.text();

    // Try to extract JSON substring
    const jsonMatch = textBody.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Parsed JSON result:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('Found JSON-like substring but failed to parse:', jsonMatch[0]);
      }
    } else {
      // Try to parse as OpenAI-style response
      try {
        const obj = JSON.parse(textBody);
        const content = obj?.choices?.[0]?.message?.content || obj?.choices?.[0]?.text || JSON.stringify(obj);
        console.log('Parsed OpenAI-style response content:', content);
      } catch (e) {
        console.log('Response text (non-JSON):', textBody);
      }
    }
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
