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

// Helper: Puppeteer Fallback (The simplified, headless browser approach)
async function fetchWithPuppeteer(url) {
    let browser = null;
    try {
        console.log('Attempting Puppeteer...');
        // Debug Env
        console.log('Env PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);

        browser = await puppeteer.launch({
            // Use env var (set to /usr/bin/chromium in Dockerfile)
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-blink-features=AutomationControlled' // Stealth trick
            ],
            headless: 'new'
        });

        const page = await browser.newPage();

        // Stealth User Agent
        const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
        await page.setUserAgent(UA);

        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

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

// Helper: Cobalt API Fallback (Public robust downloader)
async function fetchWithCobalt(url) {
    // Verified Community Instances (Prioritize user-verified ones)
    const instances = [
        'https://cobalt.meowing.de',     // Verified by user behavior
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
                console.log(`Attempting Cobalt API at ${endpoint}...`);

                const response = await axios.post(endpoint, {
                    url: url,
                    videoQuality: 'max',
                    filenameStyle: 'classic',
                    isAudioOnly: false,
                    disableMetadata: true
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });

                const data = response.data;
                if (data && (data.url || (data.picker && data.picker[0].url) || data.stream)) {
                    const videoUrl = data.url || (data.picker ? data.picker[0].url : data.stream);
                    const imageUrl = data.picker && data.picker[0].thumb ? data.picker[0].thumb : '';
                    return {
                        url_list: [videoUrl],
                        image_url: imageUrl
                    };
                }
            } catch (e) {
                const status = e.response ? e.response.status : 'N/A';
                // Don't log full data for 404/405 to keep logs clean
                if (status !== 404 && status !== 405) {
                    const data = e.response ? JSON.stringify(e.response.data) : 'No Data';
                    console.error(`Cobalt (${endpoint}) failed: Status ${status}, Data: ${data}`);
                }
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

        // Method 3: Axios
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 3: Axios Fallback');
            const fallbackLinks = await fetchWithAxios(url);
            if (fallbackLinks) links = fallbackLinks;
        }

        // Method 4: Puppeteer
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 4: Puppeteer Fallback');
            const puppeteerLinks = await fetchWithPuppeteer(url);
            if (puppeteerLinks) links = puppeteerLinks;
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
