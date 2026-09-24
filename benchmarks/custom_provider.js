const http = require('http');

class CustomOpenAiProvider {
  constructor(config) {
    this.config = config;
    this.idVal = config.id || 'custom-openai-provider';
  }

  id() {
    return this.idVal;
  }

  async callApi(prompt, context) {
    const payload = JSON.stringify({
      model: this.config.config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.config.config.temperature || 0,
      stream: false
    });

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '192.168.90.101',
        port: 3777,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.config.config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            // Bersihkan chunk SSE 'data: [DONE]' jika tertinggal di body non-stream axonrouter
            if (body.includes('data: [DONE]')) {
              body = body.split('data: [DONE]')[0].trim();
            }
            const json = JSON.parse(body);
            if (!json.choices || json.choices.length === 0) {
              resolve({ error: `Response payload kosong atau error: ${body}` });
              return;
            }
            const content = json.choices[0].message.content;
            resolve({ output: content });
          } catch (e) {
            resolve({ error: `Gagal parse JSON: ${e.message}. Raw: ${body}` });
          }
        });
      });

      req.on('error', (e) => resolve({ error: `Request error: ${e.message}` }));
      req.write(payload);
      req.end();
    });
  }
}

module.exports = CustomOpenAiProvider;
