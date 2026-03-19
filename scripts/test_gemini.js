(async () => {
  const endpoint = 'https://api.gemini.google.com/v1/complete';
  const key = process.env.GEMINI_KEY;
  const text = process.env.DIARY_TEXT || '';
  if (!key) {
    console.error('No GEMINI_KEY provided (set env GEMINI_KEY)');
    process.exit(2);
  }

  const payload = {
    prompt: `请用中文对以下日记内容做分析：\n\n${text}\n\n请返回JSON对象：{\"summary\":\"...\",\"suggestions\": [\"...\"], \"tags\": [\"...\"]}`,
    temperature: 0.3,
    max_output_tokens: 512,
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

    // Try parse JSON
    try {
      const obj = JSON.parse(textBody);
      console.log('Response JSON:', JSON.stringify(obj, null, 2));
    } catch (e) {
      console.log('Response text (non-JSON):', textBody);
    }
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
