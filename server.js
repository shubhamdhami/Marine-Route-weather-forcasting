const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
console.log('API Key loaded:', process.env.OPENWEATHER_API_KEY ? 'Yes' : 'No');
console.log('API Key length:', process.env.OPENWEATHER_API_KEY?.length);

const weatherRoutes = require('./src/routes/weatherRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.use('/api/weather', weatherRoutes);

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});