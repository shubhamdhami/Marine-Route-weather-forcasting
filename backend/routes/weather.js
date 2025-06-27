const express = require('express');
const router = express.Router();
const axios = require('axios');
const NodeCache = require('node-cache');
const { calculateMarineRoute } = require('../utils/marineRoute');

const weatherCache = new NodeCache({ stdTTL: 1800 });
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Test weather API
router.get('/test-weather', async (req, res) => {
    try {
        if (!OPENWEATHER_API_KEY) {
            return res.status(500).json({ 
                error: 'API key not configured' 
            });
        }

        const url = `${OPENWEATHER_BASE_URL}/weather?q=London&appid=${OPENWEATHER_API_KEY}&units=metric`;
        const response = await axios.get(url);
        
        res.json({
            success: true,
            message: 'Weather API working',
            data: response.data
        });
    } catch (error) {
        res.status(500).json({
            error: 'Weather API test failed',
            message: error.message
        });
    }
});

// Main route planning endpoint
router.post('/marine-route', async (req, res) => {
    try {
        const { source, destination, vesselConfig } = req.body;
        
        // Validate input
        if (!source || !destination) {
            return res.status(400).json({ 
                error: 'Source and destination required' 
            });
        }

        // Calculate route
        const routeData = calculateMarineRoute(source, destination);
        
        // Fetch weather for each waypoint
        const weatherPromises = routeData.waypoints.map((waypoint, index) => {
            const dayOffset = Math.floor((index / routeData.waypoints.length) * 10);
            return fetchWeatherForWaypoint(waypoint, dayOffset);
        });
        
        const weatherData = await Promise.all(weatherPromises);
        
        // Analyze safety
        const analysis = analyzeRouteSafety(weatherData, vesselConfig);
        
        res.json({
            success: true,
            route: routeData,
            weather: weatherData,
            analysis: analysis
        });
        
    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({ 
            error: 'Failed to plan route',
            message: error.message
        });
    }
});

async function fetchWeatherForWaypoint(waypoint, dayOffset) {
    try {
        const url = `${OPENWEATHER_BASE_URL}/weather?lat=${waypoint.lat}&lon=${waypoint.lng}&appid=${OPENWEATHER_API_KEY}&units=metric`;
        const response = await axios.get(url);
        const data = response.data;
        
        // Calculate marine conditions
        const windSpeedKnots = (data.wind.speed * 1.94384).toFixed(1);
        const waveHeight = calculateWaveHeight(data.wind.speed);
        
        return {
            timestamp: Date.now() + (dayOffset * 24 * 60 * 60 * 1000),
            dayOffset: dayOffset,
            location: waypoint.name || `${waypoint.lat.toFixed(2)}°, ${waypoint.lng.toFixed(2)}°`,
            temperature: Math.round(data.main.temp),
            description: data.weather[0].description,
            windSpeed: windSpeedKnots,
            windDirection: getWindDirection(data.wind.deg),
            waveHeight: waveHeight.toFixed(1),
            visibility: data.visibility ? (data.visibility / 1000).toFixed(1) : '10',
            pressure: data.main.pressure,
            humidity: data.main.humidity,
            precipitation: data.rain ? data.rain['1h'] || 0 : 0
        };
    } catch (error) {
        console.error('Weather fetch error:', error.message);
        return {
            timestamp: Date.now() + (dayOffset * 24 * 60 * 60 * 1000),
            location: waypoint.name,
            error: true,
            description: 'Weather data unavailable'
        };
    }
}

function calculateWaveHeight(windSpeedMs) {
    const windSpeedKnots = windSpeedMs * 1.94384;
    
    if (windSpeedKnots < 10) return 0.5;
    if (windSpeedKnots < 20) return 1.5;
    if (windSpeedKnots < 30) return 3.0;
    if (windSpeedKnots < 40) return 5.0;
    return 7.0;
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
}

function analyzeRouteSafety(weatherData, vesselConfig = {}) {
    const config = {
        maxWaveHeight: vesselConfig.maxWaveHeight || 4,
        maxWindSpeed: vesselConfig.maxWindSpeed || 35
    };
    
    let safetyScore = 100;
    const issues = [];
    
    weatherData.forEach((weather, index) => {
        if (weather.error) {
            issues.push({
                day: index + 1,
                type: 'data',
                message: 'Weather data unavailable'
            });
            return;
        }
        
        const waveHeight = parseFloat(weather.waveHeight);
        const windSpeed = parseFloat(weather.windSpeed);
        
        if (waveHeight > config.maxWaveHeight) {
            issues.push({
                day: index + 1,
                type: 'wave',
                message: `Wave height ${waveHeight}m exceeds limit`
            });
            safetyScore -= 20;
        }
        
        if (windSpeed > config.maxWindSpeed) {
            issues.push({
                day: index + 1,
                type: 'wind',
                message: `Wind speed ${windSpeed} knots exceeds limit`
            });
            safetyScore -= 20;
        }
    });
    
    safetyScore = Math.max(0, safetyScore);
    
    return {
        safetyScore,
        recommendation: safetyScore >= 80 ? 'Safe to proceed' : 
                       safetyScore >= 60 ? 'Proceed with caution' : 'Not recommended',
        issues
    };
}

module.exports = router;