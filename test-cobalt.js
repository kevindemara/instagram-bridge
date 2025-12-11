const axios = require('axios');

const cobaltUrl = 'https://cobalt-production-6c7d.up.railway.app/';
const targetUrl = 'https://www.instagram.com/p/DSF-umYCWkZ/';

async function testCobalt() {
    console.log(`Testing Cobalt at: ${cobaltUrl}`);
    console.log(`Target URL: ${targetUrl}`);

    try {
        const response = await axios.post(cobaltUrl, {
            url: targetUrl,
            filenameStyle: 'basic'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                // Mimic browser to avoid 405 if strict checking is enabled
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': cobaltUrl,
                'Referer': cobaltUrl
            }
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        if (response.data.status === 'error') {
            console.error('Cobalt Error:', response.data.text);
        } else if (response.data.url) {
            console.log('SUCCESS! Video URL found:', response.data.url);
        }

    } catch (error) {
        if (error.response) {
            console.error('Error Response:', error.response.status, error.response.data);
        } else {
            console.error('Request Error:', error.message);
        }
    }
}

testCobalt();
