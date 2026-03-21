const https = require('https');

const postData = JSON.stringify({
  url: 'https://www.youtube.com/watch?v=1ykU4QkchSE',
  isAudioOnly: true
});

const req = https.request({
  hostname: 'api.cobalt.tools',
  port: 443,
  path: '/api/json',
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': postData.length,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
  }
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data));
});

req.on('error', console.error);
req.write(postData);
req.end();
