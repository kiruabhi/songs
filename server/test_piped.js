const https = require('https');

https.get('https://pipedapi.kavin.rocks/streams/nD1jhw6F-J4', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Audio Streams:', json.audioStreams.map(s => s.url));
    } catch(e) {
      console.error(e, data);
    }
  });
}).on('error', console.error);
