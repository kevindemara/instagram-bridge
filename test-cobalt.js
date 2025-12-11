const axios = require('axios');

const cobaltUrl = 'https://cobalt-production-6c7d.up.railway.app/';
const targetUrl = 'https://www.instagram.com/p/DSF-umYCWkZ/'; // The one user tested

async function testCobalt() {
    console.log(`Testing Cobalt directly at: ${cobaltUrl}`);
    console.log(`Target URL: ${targetUrl}`);

    try {
        const response = await axios.post(cobaltUrl, {
            url: targetUrl,
            filenameStyle: 'basic'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': cobaltUrl,
                'Referer': cobaltUrl
            }
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        if (response.data.status === 'stream' || response.data.status === 'redirect') {
            console.log('✅ SUCCESS! URL found:', response.data.url);
        } else if (response.data.status === 'error') {
            console.log('❌ COBALT ERROR:', response.data.text || response.data.error.code);
        }

    } catch (error) {
        if (error.response) {
            console.error('❌ HTTP ERROR:', error.response.status);
            console.error('Full Error Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Request Error:', error.message);
        }
    }
}

testCobalt();
