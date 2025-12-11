const express = require('express');
let instagramGetUrl = require('instagram-url-direct');
const axios = require('axios');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

// Handle ESM default export
if (typeof instagramGetUrl !== 'function') {
    if (typeof instagramGetUrl.default === 'function') {
        instagramGetUrl = instagramGetUrl.default;
    } else if (typeof instagramGetUrl.instagramGetUrl === 'function') {
        instagramGetUrl = instagramGetUrl.instagramGetUrl;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    if (API_SECRET) {
        const token = req.headers['x-api-secret'] || req.query.secret;
        if (token !== API_SECRET) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
    }
    next();
});

app.get('/', (req, res) => {
    res.send('Instagram Bridge is running. POST to /fetch to use.');
});

// Fallback: RapidAPI (Generic - User Configurable)
async function fetchWithRapidAPI(url) {
    if (!process.env.RAPIDAPI_KEY) return null;

    // Defaults to RocketAPI (Gold Standard)
    const host = process.env.RAPIDAPI_HOST || 'rocketapi-for-instagram.p.rapidapi.com';
    const endpoint = process.env.RAPIDAPI_ENDPOINT || '/instagram/media';
    const method = process.env.RAPIDAPI_METHOD || 'POST';

    console.log(`Attempting RapidAPI (${host})...`);
    try {
        const options = {
            method: method,
            url: `https://${host}${endpoint}`,
            headers: {
                'content-type': 'application/json',
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': host
            }
        };

        if (method === 'GET') {
            options.params = { url: url };
        } else {
            options.data = { url: url };
        }

        const response = await axios.request(options);
        const data = response.data;

        // 1. RocketAPI Format
        if (data && data.response && data.response.body) {
            const body = data.response.body;
            if (body.video_url) return { url_list: [body.video_url], image_url: body.thumbnail_url || '' };
            if (body.items && body.items[0] && body.items[0].video_versions) return { url_list: [body.items[0].video_versions.sort((a, b) => b.width - a.width)[0].url], image_url: '' };
        }

        // 2. Generic Format (video_url / url_list)
        if (data && (data.video_url || data.link || data.url)) {
            return {
                url_list: [data.video_url || data.link || data.url],
                image_url: data.thumbnail || data.thumb || ''
            };
        }

    } catch (error) {
        console.error('RapidAPI failed:', error.message);
        if (error.response) console.error('RapidAPI Response:', error.response.data);
    }
    return null;
}

// Fallback: Puppeteer (Headless Browser) - Now with STEALTH
async function fetchWithPuppeteer(url) {
    console.log('Attempting Puppeteer Stealth...');
    let browser = null;
    try {
        // Use puppeteer-extra for stealth
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());

        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
        console.log(`Env PUPPETEER_EXECUTABLE_PATH: ${executablePath}`);

        browser = await puppeteer.launch({
            executablePath: executablePath,
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Stealth: Set User Agent override explicitly just in case
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Optional: Inject Cookie if provided (Bypass Login Wall)
        if (process.env.IG_COOKIE) {
            console.log('Injecting IG_COOKIE session...');
            const cookies = process.env.IG_COOKIE.split(';').map(c => {
                const [name, value] = c.split('=').map(s => s.trim());
                return { name, value, domain: '.instagram.com' };
            });
            await page.setCookie(...cookies);
        }

        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Debug: Check Title
        const title = await page.title();
        console.log(`Page Title: ${title}`);

        if (title.includes('Login') || title.includes('Instagram')) {
            console.log('Warning: Possible Login Wall detection based on title.');
        }

        // 1. Try Video Tag
        try {
            await page.waitForSelector('video', { timeout: 5000 });
        } catch (e) {
            console.log('Video tag not found immediately.');
        }

        // 2. Deep Extraction
        const data = await page.evaluate(() => {
            // A. DOM Video
            const video = document.querySelector('video');
            if (video && video.src && !video.src.startsWith('blob:') && video.src.length > 0) {
                return { video_url: video.src, type: 'dom_video' };
            }

            // B. Meta Tags
            const metaVideo = document.querySelector('meta[property="og:video"]');
            if (metaVideo && metaVideo.content) {
                return { video_url: metaVideo.content, type: 'meta_og' };
            }

            // C. JSON Scripts (sharedData or additionalData)
            try {
                // Look for script containing graphql or additionalData
                const scripts = Array.from(document.querySelectorAll('script'));
                for (let s of scripts) {
                    if (s.textContent && s.textContent.includes('video_url')) {
                        // Very crude regex extraction to find video_url":"https://..."
                        const match = s.textContent.match(/"video_url"\s*:\s*"([^"]+)"/);
                        if (match && match[1]) {
                            // clean unescaped unicode
                            let vUrl = JSON.parse('"' + match[1] + '"'); // decode json string
                            return { video_url: vUrl, type: 'script_regex' };
                        }
                    }
                }
            } catch (e) { }

            return null;
        });

        if (data && data.video_url) {
            console.log(`Puppeteer Success via ${data.type}`);
            return {
                url_list: [data.video_url],
                image_url: ''
            };
        } else {
            // Debug: Log plain text content to identify the wall
            const content = await page.content();
            console.log('Page Snippet:', content.substring(0, 500));
        }

    } catch (e) {
        console.error('Puppeteer failed:', e.message);
    } finally {
        if (browser) await browser.close();
    }
    return null;
}

async function fetchWithAxios(url) {
    // ... (Keep existing Axios logic same as before, but shortened here for brevity in mental model)
    // Actually I need to write the FULL file content or I lose Axios code.
    try {
        const matches = url.match(/instagram.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/);
        if (!matches) return null;
        const shortcode = matches[1];
        const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
        });
        const data = response.data;
        let videoUrl = '';
        if (data.graphql && data.graphql.shortcode_media) videoUrl = data.graphql.shortcode_media.video_url;
        else if (data.items && data.items[0] && data.items[0].video_versions) videoUrl = data.items[0].video_versions[0].url;

        if (videoUrl) return { url_list: [videoUrl], image_url: '' };
    } catch (e) { console.error('Axios failed:', e.message); }
    return null;
}

const { spawn } = require('child_process');

// Helper: Curl Wrapper to bypass Node/Axios fingerprinting
function runCurl(endpoint, body) {
    return new Promise((resolve, reject) => {
        const curl = spawn('curl', [
            '-X', 'POST',
            '-k', // Insecure (matches user's curl)
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

// Helper: Cobalt API Fallback (Public robust downloader)
async function fetchWithCobalt(url) {
    // Verified Community Instances (Prioritize user-verified ones)
    const selfHosted = process.env.COBALT_URL ? process.env.COBALT_URL.replace(/\/$/, '') : null;
    // Use user provided Cobalt first, then public
    const instances = [
        ...(selfHosted ? [selfHosted] : []),
        'https://cobalt.meowing.de',
        'https://cobalt.clxxped.lol',
        'https://cobalt.canine.tools',
        'https://cobalt.kwiatekmiki.com'
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
                    // Minimal payload: No other fields, as proved by user
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

// Handler logic
const handleFetch = async (req, res) => {
    const url = req.body.url || req.query.url;

    if (!url) {
        return res.status(400).json({ success: false, error: 'No URL provided' });
    }

    try {
        console.log(`Fetching: ${url}`);
        let links;

        // Method 1: Cobalt
        links = await fetchWithCobalt(url);

        // Method 2: Library
        if (!links || !links.url_list || links.url_list.length === 0) {
            try {
                console.log('Method 2: Library');
                links = await instagramGetUrl(url);
            } catch (e) {
                console.log('Method 2 failed:', e.message || e);
            }
        }

        // Method 3: RapidAPI (If Key exists)
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 3: RapidAPI');
            links = await fetchWithRapidAPI(url);
            if (links) console.log('RapidAPI successful.');
        }

        // Method 4: Axios Fallback (JSON query)
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 4: Axios Fallback');
            links = await fetchWithAxios(url);
            if (links) console.log('Axios successful.');
        }

        // Method 5: Puppeteer Fallback (Stealth)
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 5: Puppeteer Fallback');
            links = await fetchWithPuppeteer(url);
            if (links) console.log('Puppeteer successful.');
        }

        if (links && links.url_list && links.url_list.length > 0) {
            return res.json({
                success: true,
                video_url: links.url_list[0],
                image_url: links.image_url || ''
            });
        } else {
            return res.status(404).json({ success: false, error: 'No media found', details: 'All methods failed (Cobalt, Lib, Axios, Puppeteer).' });
        }

    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

app.post('/fetch', handleFetch);
app.get('/fetch', handleFetch);

app.listen(PORT, () => {
    console.log(`Running on ${PORT}`);
});
