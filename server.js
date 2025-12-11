const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper: Curl Wrapper to bypass Node/Axios fingerprinting
function runCurl(endpoint, body) {
    return new Promise((resolve, reject) => {
        const curl = spawn('curl', [
            '-X', 'POST',
            '-k', // Insecure (matches user's successful test)
            endpoint,
            '-H', 'Accept: application/json',
            '-H', 'Content-Type: application/json',
            '-H', 'User-Agent: curl/7.68.0', // Mimic curl
            '-d', '@-' // Read from stdin
        ]);

        let stdout = '';
        let stderr = '';

        curl.stdout.on('data', d => stdout += d);
        curl.stderr.on('data', d => stderr += d);

        curl.on('close', code => {
            if (code === 0) {
                try {
                    const json = JSON.parse(stdout);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`Invalid JSON from curl: ${stdout.substring(0, 100)}`));
                }
            } else {
                reject(new Error(`Curl failed code ${code}: ${stderr}`));
            }
        });

        curl.on('error', err => reject(err));

        curl.stdin.write(JSON.stringify(body));
        curl.stdin.end();
    });
}

// Data Source: Cobalt API (Self-Hosted or Public)
async function fetchWithCobalt(url) {
    // Verified Community Instances (Prioritize user-verified ones)
    const selfHosted = process.env.COBALT_URL ? process.env.COBALT_URL.replace(/\/$/, '') : null;

    // User's self-hosted instance is Priority #1
    // We removed the other public instances as user wants to rely on their own infrastructure
    const instances = [
        ...(selfHosted ? [selfHosted] : []),
        'https://cobalt.meowing.de', // Backup 1
        'https://cobalt.clxxped.lol' // Backup 2
    ];

    for (const instance of instances) {
        // Try both v10 (root) and v7 (/api/json) endpoints for each instance
        const endpoints = [
            instance + '/',         // v10
            instance + '/api/json'  // v7
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`Attempting Cobalt API (Curl) at ${endpoint}...`);

                // Use Curl instead of Axios to match user's success
                const data = await runCurl(endpoint, {
                    url: url
                    // Minimal payload: No other fields
                });

                if (data && (data.url || (data.picker && data.picker[0].url) || data.stream)) {
                    const videoUrl = data.url || (data.picker ? data.picker[0].url : data.stream);
                    const imageUrl = data.picker && data.picker[0].thumb ? data.picker[0].thumb : '';
                    return {
                        url_list: [videoUrl],
                        image_url: imageUrl
                    };
                } else if (data && data.status === 'error') {
                    console.error(`Cobalt Error (${endpoint}):`, JSON.stringify(data));
                }
            } catch (e) {
                console.error(`Cobalt (${endpoint}) failed:`, e.message);
            }
        }
    }
    return null;
}

// Main Endpoint
app.post('/fetch', async (req, res) => {
    const { url } = req.body;

    // Security: Basic Secret Check
    if (process.env.API_SECRET) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
    }

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    console.log(`Fetching: ${url}`);

    // Single Strategy: Cobalt (via Curl)
    const links = await fetchWithCobalt(url);

    if (links) {
        return res.json({ success: true, ...links });
    } else {
        return res.status(404).json({
            success: false,
            error: 'No media found',
            details: 'Cobalt failed to retrieve media.'
        });
    }
});

// Root Endpoint
app.get('/', (req, res) => {
    res.send('Instagram Bridge (Cobalt Only) is running. POST to /fetch to use.');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Cobalt URL: ${process.env.COBALT_URL || 'Using Public Instances'}`);
});
