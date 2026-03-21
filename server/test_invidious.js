const https = require('https');

const instances = [
  'invidious.jing.rocks',
  'invidious.nerdvpn.de',
  'invidious.perennialte.ch'
];

instances.forEach(host => {
  https.get({
    hostname: host,
    path: '/api/v1/videos/1ykU4QkchSE',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const format = json.formatStreams.find(s => s.type.includes('audio/mp4') || s.itag === "140");
        if (format) {
          console.log(`SUCCESS [${host}]: URL: ${format.url.substring(0,60)}...`);
        } else {
          console.log(`FAIL [${host}]: No formatStreams found.`);
        }
      } catch (e) {
        console.log(`FAIL [${host}]: Could not parse JSON. (${res.statusCode})`);
      }
    });
  }).on('error', err => console.log(`FAIL [${host}]: ${err.message}`));
});
