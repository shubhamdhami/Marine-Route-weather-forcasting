const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weatherController');

// Route weather endpoint - Get weather for entire route
router.post('/route', weatherController.getRouteWeather);

// Point weather endpoint - Get weather for specific coordinates
router.get('/point/:lat/:lng', weatherController.getPointWeather);

// Storm alerts endpoint - Get storm warnings for area
router.get('/alerts/:lat/:lng', weatherController.getStormAlerts);

// Marine forecast endpoint - Get detailed marine conditions
router.post('/marine-forecast', weatherController.getMarineForecast);

// Route optimization endpoint - Get weather-optimized route
router.post('/optimize-route', weatherController.getOptimizedRoute);

// Historical weather endpoint - Get historical data for route planning
router.get('/historical/:lat/:lng/:date', weatherController.getHistoricalWeather);

module.exports = router;