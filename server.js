const express = require('express');
let instagramGetUrl = require('instagram-url-direct');
const axios = require('axios');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

// Handle ESM default export or named export in CommonJS
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

// Middleware to check secret if set
app.use((req, res, next) => {
    if (API_SECRET) {
        const token = req.headers['x-api-secret'] || req.query.secret;
        if (token !== API_SECRET) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
    }
    next();
});

// Root endpoint for health check
app.get('/', (req, res) => {
    res.send('Instagram Bridge is running. POST to /fetch to use.');
});

// Helper: Puppeteer Fallback (The simplified, headless browser approach)
async function fetchWithPuppeteer(url) {
    let browser = null;
    try {
        console.log('Attempting Puppeteer...');
        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
            headless: 'new'
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Go to URL
        // Using networkidle2 to wait for initial load
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

        // Wait for video tag (give it a moment to render)
        try {
            await page.waitForSelector('video', { timeout: 8000 });
        } catch (e) {
            // connection might be slow or login wall
        }

        // Extract
        const data = await page.evaluate(() => {
            const video = document.querySelector('video');
            const poster = video ? video.getAttribute('poster') : null;

            // Check for blob (won't work for download) but usually IG provides direct src
            if (video && video.src && !video.src.startsWith('blob:')) {
                return { video_url: video.src, image_url: poster };
            }

            // Fallback: Check for meta tags
            const metaVideo = document.querySelector('meta[property="og:video"]');
            const metaImage = document.querySelector('meta[property="og:image"]');

            if (metaVideo) {
                return {
                    video_url: metaVideo.content,
                    image_url: metaImage ? metaImage.content : null
                };
            }
            return null;
        });

        if (data && data.video_url) {
            return {
                url_list: [data.video_url],
                image_url: data.image_url
            };
        }

    } catch (e) {
        console.error('Puppeteer failed:', e.message);
    } finally {
        if (browser) await browser.close();
    }
    return null;
}

// Helper: Axios Fallback
async function fetchWithAxios(url) {
    try {
        // Extract shortcode
        const matches = url.match(/instagram.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/);
        if (!matches) return null;
        const shortcode = matches[1];

        const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;

        console.log(`Axios Attempt: ${apiUrl}`);

        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
        });

        const data = response.data;

        // Parse Graphql
        let videoUrl = '';
        let imageUrl = '';

        if (data.graphql && data.graphql.shortcode_media) {
            const media = data.graphql.shortcode_media;
            videoUrl = media.video_url;
            imageUrl = media.display_url;
        } else if (data.items && data.items[0]) {
            const item = data.items[0];
            if (item.video_versions && item.video_versions[0]) {
                videoUrl = item.video_versions[0].url;
            }
            if (item.image_versions2 && item.image_versions2.candidates[0]) {
                imageUrl = item.image_versions2.candidates[0].url;
            }
        }

        if (videoUrl) {
            return {
                results_number: 1,
                url_list: [videoUrl],
                image_url: imageUrl // Custom prop
            };
        }

    } catch (e) {
        console.error('Axios fallback failed:', e.message);
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

        // Method 1: Library
        try {
            console.log('Method 1: Library');
            links = await instagramGetUrl(url);
        } catch (e) {
            console.log('Method 1 failed:', e.message);
        }

        // Method 2: Axios
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 2: Axios Fallback');
            const fallbackLinks = await fetchWithAxios(url);
            if (fallbackLinks) links = fallbackLinks;
        }

        // Method 3: Puppeteer
        if (!links || !links.url_list || links.url_list.length === 0) {
            console.log('Method 3: Puppeteer Fallback');
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
            return res.status(404).json({ success: false, error: 'No media found', details: 'All 3 methods failed' });
        }

    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

app.post('/fetch', handleFetch);
app.get('/fetch', handleFetch);


app.listen(PORT, () => {
    console.log(`Instagram Bridge running on http://localhost:${PORT}`);
});
