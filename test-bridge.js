const axios = require('axios');

const bridgeUrl = 'https://web-production-785ec.up.railway.app/fetch';
const targetUrl = 'https://www.instagram.com/p/DSF-umYCWkZ/'; // The one user tested

async function testBridge() {
    console.log(`Testing Bridge at: ${bridgeUrl}`);
    console.time('Duration');

    try {
        const response = await axios.post(bridgeUrl, {
            url: targetUrl
        }, {
            timeout: 60000 // 60s timeout for test
        });

        console.timeEnd('Duration');
        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.timeEnd('Duration');
        if (error.response) {
            console.error('Error Response:', error.response.status, error.response.data);
        } else {
            console.error('Request Error:', error.message);
        }
    }
}

testBridge();
