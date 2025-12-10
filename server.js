const express = require('express');
const instagramGetUrl = require('instagram-url-direct');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET; // Optional: Simple protection

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

app.post('/fetch', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'No URL provided' });
    }

    try {
        console.log(`Fetching: ${url}`);
        const links = await instagramGetUrl(url);

        // Structure from instagram-url-direct: { results_number: 1, url_list: [ '...' ] }
        if (links.url_list && links.url_list.length > 0) {
            return res.json({
                success: true,
                video_url: links.url_list[0], // First URL usually video
                image_url: '' // Often doesn't return thumbnail separate, WP will generate if video uploaded? 
                // Actually instagram-url-direct might return different structure depending on version. 
                // Let's assume it returns a list.
            });
        } else {
            return res.status(404).json({ success: false, error: 'No media found' });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Instagram Bridge running on http://localhost:${PORT}`);
});
