const weatherService = require('../services/weatherService');
const { 
    calculateDistance, 
    interpolatePoints, 
    validateCoordinates,
    formatCoordinates,
    calculateBearing,
    estimateWaveHeight,
    calculateSeaState,
    estimateSwellHeight,
    estimateCurrentSpeed,
    getSeaStateDescription,
    getWindDirection
} = require('../utils/helpers');

// Get weather data for entire route
exports.getRouteWeather = async (req, res) => {
    try {
        const { origin, destination, vesselType, maxWindSpeed, maxWaveHeight } = req.body;

        // Validate input
        if (!validateCoordinates(origin.lat, origin.lng) || 
            !validateCoordinates(destination.lat, destination.lng)) {
            return res.status(400).json({ error: 'Invalid coordinates provided' });
        }

        // Calculate route points (10 intermediate points)
        const routePoints = interpolatePoints(origin, destination, 10);
        
        // Get weather for each point
        const weatherPromises = routePoints.map(point => 
            weatherService.getWeatherForecast(point.lat, point.lng)
        );
        
        const weatherData = await Promise.all(weatherPromises);

        // Process and aggregate data
        const forecast = processWeatherData(weatherData, routePoints);
        
        // Calculate route information
        const distance = calculateDistance(origin, destination);
        const bearing = calculateBearing(origin, destination);
        const avgSpeed = getVesselSpeed(vesselType);
        const duration = Math.round(distance / avgSpeed);

        // Check for hazardous conditions
        const hazards = identifyHazards(forecast, { maxWindSpeed, maxWaveHeight });

        res.json({
            routeInfo: {
                origin: formatCoordinates(origin.lat, origin.lng),
                destination: formatCoordinates(destination.lat, destination.lng),
                distance: Math.round(distance),
                bearing: Math.round(bearing),
                duration: duration,
                avgTemp: calculateAvgTemp(forecast),
                vesselType: vesselType
            },
            forecast: forecast,
            vesselLimits: {
                maxWindSpeed,
                maxWaveHeight
            },
            hazards: hazards,
            recommendations: generateRecommendations(hazards, forecast)
        });
    } catch (error) {
        console.error('Error getting route weather:', error);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
};

// Get weather for specific point
exports.getPointWeather = async (req, res) => {
    try {
        const { lat, lng } = req.params;
        
        if (!validateCoordinates(parseFloat(lat), parseFloat(lng))) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }

        const weather = await weatherService.getWeatherForecast(lat, lng);
        const current = weather.current || {};
        const daily = weather.daily || [];

        res.json({
            location: formatCoordinates(lat, lng),
            current: {
                temp: current.temp,
                windSpeed: (current.wind_speed || 0) * 1.94384, // m/s to knots
                windDirection: current.wind_deg,
                windDirectionText: getWindDirection(current.wind_deg || 0),
                weather: current.weather?.[0]?.main || 'Unknown',
                visibility: (current.visibility || 10000) / 1000, // m to km
                pressure: current.pressure,
                humidity: current.humidity,
                waveHeight: estimateWaveHeight(current.wind_speed || 0),
                swellHeight: estimateSwellHeight(current.wind_speed || 0),
                currentSpeed: estimateCurrentSpeed(lat, lng)
            },
            forecast: daily.slice(0, 7).map(day => ({
                date: new Date(day.dt * 1000).toISOString(),
                temp: day.temp.day,
                windSpeed: (day.wind_speed || 0) * 1.94384,
                weather: day.weather?.[0]?.main || 'Unknown',
                waveHeight: estimateWaveHeight(day.wind_speed || 0),
                swellHeight: estimateSwellHeight(day.wind_speed || 0)
            }))
        });
    } catch (error) {
        console.error('Error getting point weather:', error);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
};

// Get storm alerts for area
exports.getStormAlerts = async (req, res) => {
    try {
        const { lat, lng } = req.params;
        const radius = req.query.radius || 100; // Default 100nm radius

        const alerts = await weatherService.getStormAlerts(lat, lng);
        const weather = await weatherService.getWeatherForecast(lat, lng);
        
        // Check for storm conditions in forecast
        const stormWarnings = [];
        
        weather.daily?.forEach((day, index) => {
            const windSpeed = (day.wind_speed || 0) * 1.94384;
            const waveHeight = estimateWaveHeight(day.wind_speed);
            const seaState = calculateSeaState(waveHeight);
            
            if (windSpeed > 34 || seaState >= 6 || 
                day.weather?.[0]?.main === 'Storm' || 
                day.weather?.[0]?.main === 'Thunderstorm') {
                stormWarnings.push({
                    day: index,
                    date: new Date(day.dt * 1000).toISOString(),
                    severity: windSpeed > 64 ? 'extreme' : windSpeed > 48 ? 'severe' : 'moderate',
                    windSpeed: Math.round(windSpeed),
                    waveHeight: waveHeight.toFixed(1),
                    seaState: seaState,
                    seaStateDesc: getSeaStateDescription(seaState),
                    conditions: day.weather?.[0]?.main || 'Unknown',
                    description: day.weather?.[0]?.description || '',
                    recommendations: getStormRecommendations(windSpeed, seaState)
                });
            }
        });

        res.json({
            location: formatCoordinates(lat, lng),
            radius: radius,
            alerts: alerts,
            stormWarnings: stormWarnings,
            safetyStatus: stormWarnings.length === 0 ? 'safe' : 'hazardous'
        });
    } catch (error) {
        console.error('Error getting storm alerts:', error);
        res.status(500).json({ error: 'Failed to fetch storm alerts' });
    }
};

// Get detailed marine forecast
exports.getMarineForecast = async (req, res) => {
    try {
        const { points } = req.body; // Array of {lat, lng} points
        
        if (!points || points.length === 0) {
            return res.status(400).json({ error: 'No route points provided' });
        }

        const marineData = await Promise.all(
            points.map(async point => {
                const weather = await weatherService.getWeatherForecast(point.lat, point.lng);
                return processMarineData(weather, point);
            })
        );

        res.json({
            marineConditions: marineData,
            summary: generateMarineSummary(marineData)
        });
    } catch (error) {
        console.error('Error getting marine forecast:', error);
        res.status(500).json({ error: 'Failed to fetch marine forecast' });
    }
};

// Get weather-optimized route
exports.getOptimizedRoute = async (req, res) => {
    try {
        const { origin, destination, vesselType, departureTime } = req.body;
        
        // Generate multiple possible routes
        const routes = generateAlternativeRoutes(origin, destination);
        
        // Evaluate each route for weather conditions
        const evaluatedRoutes = await Promise.all(
            routes.map(async route => {
                const weatherData = await getRouteWeatherData(route.points);
                const score = evaluateRouteWeather(weatherData, vesselType);
                return { ...route, weatherScore: score, conditions: weatherData };
            })
        );

        // Sort by weather score (lower is better)
        evaluatedRoutes.sort((a, b) => a.weatherScore - b.weatherScore);

        res.json({
            recommendedRoute: evaluatedRoutes[0],
            alternativeRoutes: evaluatedRoutes.slice(1, 3),
            departureTime: departureTime,
            analysis: generateRouteAnalysis(evaluatedRoutes[0])
        });
    } catch (error) {
        console.error('Error optimizing route:', error);
        res.status(500).json({ error: 'Failed to optimize route' });
    }
};

// Get historical weather data
exports.getHistoricalWeather = async (req, res) => {
    try {
        const { lat, lng, date } = req.params;
        
        // Note: OpenWeatherMap requires a paid subscription for historical data
        // This is a mock implementation
        const historicalData = await weatherService.getHistoricalWeather(lat, lng, date);
        
        res.json({
            location: formatCoordinates(lat, lng),
            date: date,
            data: historicalData,
            statistics: calculateHistoricalStats(historicalData)
        });
    } catch (error) {
        console.error('Error getting historical weather:', error);
        res.status(500).json({ error: 'Failed to fetch historical weather data' });
    }
};

// Helper functions
function processWeatherData(weatherData, routePoints) {
    const dailyData = {};
    
    weatherData.forEach((pointData, pointIndex) => {
        if (!pointData.daily) return;
        
        const point = routePoints[pointIndex];
        
        pointData.daily.forEach((day, index) => {
            if (!dailyData[index]) {
                dailyData[index] = {
                    temp: [],
                    windSpeed: [],
                    windGust: [],
                    windDirection: [],
                    waveHeight: [],
                    swellHeight: [],
                    currentSpeed: [],
                    weather: [],
                    precipitation: [],
                    visibility: [],
                    pressure: [],
                    humidity: [],
                    clouds: []
                };
            }
            
            dailyData[index].temp.push(day.temp?.day || 20);
            dailyData[index].windSpeed.push(day.wind_speed || 0);
            dailyData[index].windGust.push(day.wind_gust || day.wind_speed || 0);
            dailyData[index].windDirection.push(day.wind_deg || 0);
            dailyData[index].waveHeight.push(estimateWaveHeight(day.wind_speed || 0));
            dailyData[index].swellHeight.push(estimateSwellHeight(day.wind_speed || 0));
            dailyData[index].currentSpeed.push(estimateCurrentSpeed(point.lat, point.lng));
            dailyData[index].weather.push(day.weather?.[0]?.main || 'Clear');
            dailyData[index].precipitation.push((day.rain || 0) + (day.snow || 0));
            dailyData[index].visibility.push((day.visibility || 10000) / 1000);
            dailyData[index].pressure.push(day.pressure || 1013);
            dailyData[index].humidity.push(day.humidity || 70);
            dailyData[index].clouds.push(day.clouds || 0);
        });
    });

    // Average the values and format for 10 days
    return Object.keys(dailyData).slice(0, 10).map(key => {
        const day = dailyData[key];
        const avgWaveHeight = average(day.waveHeight);
        
        return {
            date: new Date(Date.now() + (parseInt(key) * 24 * 60 * 60 * 1000)).toISOString(),
            temp: Math.round(average(day.temp)),
            windSpeed: Math.round(average(day.windSpeed) * 1.94384), // Convert m/s to knots
            windGust: Math.round(average(day.windGust) * 1.94384),
            windDirection: Math.round(average(day.windDirection)),
            windDirectionText: getWindDirection(average(day.windDirection)),
            waveHeight: Math.round(avgWaveHeight * 10) / 10,
            swellHeight: Math.round(average(day.swellHeight) * 10) / 10,
            currentSpeed: Math.round(average(day.currentSpeed) * 10) / 10,
            seaState: calculateSeaState(avgWaveHeight),
            seaStateDesc: getSeaStateDescription(calculateSeaState(avgWaveHeight)),
            weather: getMostFrequent(day.weather),
            precipitation: Math.round(average(day.precipitation)),
            visibility: Math.round(average(day.visibility)),
            pressure: Math.round(average(day.pressure)),
            humidity: Math.round(average(day.humidity)),
            clouds: Math.round(average(day.clouds))
        };
    });
}

function processMarineData(weather, point) {
    const current = weather.current || {};
    const hourly = weather.hourly || [];
    
    return {
        location: formatCoordinates(point.lat, point.lng),
        current: {
            windSpeed: (current.wind_speed || 0) * 1.94384,
            windDirection: current.wind_deg || 0,
            windGust: (current.wind_gust || current.wind_speed || 0) * 1.94384,
            waveHeight: estimateWaveHeight(current.wind_speed || 0),
            waveDirection: current.wind_deg || 0, // Simplified - same as wind
            wavePeriod: estimateWavePeriod(current.wind_speed || 0),
            seaState: calculateSeaState(estimateWaveHeight(current.wind_speed || 0)),
            swellHeight: estimateSwellHeight(current.wind_speed || 0),
            swellDirection: current.wind_deg || 0,
            swellPeriod: estimateSwellPeriod(current.wind_speed || 0),
            currentSpeed: estimateCurrentSpeed(point.lat, point.lng),
            currentDirection: estimateCurrentDirection(point.lat, point.lng),
            visibility: (current.visibility || 10000) / 1000,
            pressure: current.pressure || 1013,
            temp: current.temp || 20
        },
        hourly: hourly.slice(0, 24).map(hour => ({
            time: new Date(hour.dt * 1000).toISOString(),
            windSpeed: (hour.wind_speed || 0) * 1.94384,
            waveHeight: estimateWaveHeight(hour.wind_speed || 0),
            visibility: (hour.visibility || 10000) / 1000
        }))
    };
}

function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getMostFrequent(arr) {
    const counts = {};
    let maxCount = 0;
    let mostFrequent = arr[0];
    
    arr.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
        if (counts[item] > maxCount) {
            maxCount = counts[item];
            mostFrequent = item;
        }
    });
    
    return mostFrequent;
}

function calculateAvgTemp(forecast) {
    const temps = forecast.map(day => day.temp);
    return Math.round(average(temps));
}

function getVesselSpeed(vesselType) {
    const speeds = {
        cargo: 15,
        tanker: 14,
        container: 22,
        passenger: 20,
        yacht: 12,
        fishing: 10,
        naval: 25,
        bulk: 14,
        cruise: 18
    };
    return speeds[vesselType] || 15;
}

function identifyHazards(forecast, limits) {
    const hazards = [];
    
    forecast.forEach((day, index) => {
        const issues = [];
        
        if (day.windSpeed > limits.maxWindSpeed) {
            issues.push(`Wind speed (${day.windSpeed} kts) exceeds vessel limit of ${limits.maxWindSpeed} kts`);
        }
        if (day.waveHeight > limits.maxWaveHeight) {
            issues.push(`Wave height (${day.waveHeight} m) exceeds vessel limit of ${limits.maxWaveHeight} m`);
        }
        if (day.visibility < 1) {
            issues.push(`Poor visibility (${day.visibility} km) - fog navigation required`);
        }
        if (day.weather === 'Storm' || day.weather === 'Thunderstorm') {
            issues.push(`Storm conditions - ${day.weather}`);
        }
        if (day.seaState >= 6) {
            issues.push(`${day.seaStateDesc} - dangerous sea conditions`);
        }
        
        if (issues.length > 0) {
            hazards.push({
                day: index,
                date: day.date,
                issues: issues,
                severity: determineSeverity(day, limits),
                recommendations: getHazardRecommendations(day, limits)
            });
        }
    });
    
    return hazards;
}

function determineSeverity(day, limits) {
    if (day.windSpeed > 64 || day.waveHeight > 9 || day.seaState >= 8) {
        return 'extreme';
    } else if (day.windSpeed > 48 || day.waveHeight > 6 || day.seaState >= 6) {
        return 'severe';
    } else if (day.windSpeed > limits.maxWindSpeed || day.waveHeight > limits.maxWaveHeight) {
        return 'moderate';
    }
    return 'low';
}

function getHazardRecommendations(day, limits) {
    const recommendations = [];
    
    if (day.windSpeed > 64) {
        recommendations.push('Hurricane force winds - DO NOT SAIL');
    } else if (day.windSpeed > 48) {
        recommendations.push('Storm force winds - postpone voyage or seek shelter');
    } else if (day.windSpeed > limits.maxWindSpeed) {
        recommendations.push('Wind exceeds vessel limits - consider waiting for better conditions');
    }
    
    if (day.seaState >= 7) {
        recommendations.push('Very high to phenomenal seas - extreme danger');
    } else if (day.seaState >= 5) {
        recommendations.push('Rough to very rough seas - secure all cargo and equipment');
    }
    
    if (day.visibility < 1) {
        recommendations.push('Use radar, reduce speed, sound fog signals');
    }
    
    return recommendations;
}

function generateRecommendations(hazards, forecast) {
    const recommendations = [];
    
    if (hazards.length === 0) {
        recommendations.push('✅ Weather conditions are favorable for voyage');
        recommendations.push('Normal voyage preparations recommended');
        return recommendations;
    }
    
    // Check severity levels
    const extremeHazards = hazards.filter(h => h.severity === 'extreme');
    const severeHazards = hazards.filter(h => h.severity === 'severe');
    
    if (extremeHazards.length > 0) {
        recommendations.push('⛔ EXTREME DANGER - Voyage strongly discouraged');
        recommendations.push(`${extremeHazards.length} days with extreme conditions detected`);
    } else if (severeHazards.length > 0) {
        recommendations.push('⚠️ SEVERE CONDITIONS - Only emergency voyages recommended');
        recommendations.push(`${severeHazards.length} days with severe weather expected`);
    }
    
    // Check specific conditions
    const highWindDays = forecast.filter(d => d.windSpeed > 40).length;
    if (highWindDays > 3) {
        recommendations.push('Extended period of high winds - plan for rough seas throughout voyage');
    }
    
    const stormDays = forecast.filter(d => 
        d.weather === 'Storm' || d.weather === 'Thunderstorm'
    ).length;
    if (stormDays > 0) {
        recommendations.push('Storm conditions expected - ensure all safety equipment is operational');
        recommendations.push('Brief crew on heavy weather procedures');
    }
    
    // Add timing recommendations
    if (hazards.length > 0 && hazards[0].day <= 2) {
        recommendations.push('Poor conditions in first 48 hours - consider delaying departure');
    }
    
    // Safety preparations
    recommendations.push('Double-check weather routing equipment');
    recommendations.push('Ensure adequate fuel reserves for weather routing');
    
    return recommendations;
}

function getStormRecommendations(windSpeed, seaState) {
    const recommendations = [];
    
    // Wind-based recommendations
    if (windSpeed > 64) {
        recommendations.push('Hurricane force winds - seek immediate shelter');
        recommendations.push('DO NOT attempt to navigate in these conditions');
    } else if (windSpeed > 48) {
        recommendations.push('Storm force winds - only essential voyages');
        recommendations.push('Ensure storm preparations are complete');
    } else if (windSpeed > 34) {
        recommendations.push('Gale force winds - experienced crew essential');
        recommendations.push('Reduce sail, secure deck cargo');
    }
    
    // Sea state recommendations
    if (seaState >= 8) {
        recommendations.push('Phenomenal seas - survival conditions only');
    } else if (seaState >= 7) {
        recommendations.push('Very high seas - heave to if necessary');
    } else if (seaState >= 6) {
        recommendations.push('Very rough seas - reduce speed, alter course to ease motion');
    }
    
    return recommendations;
}

function generateAlternativeRoutes(origin, destination) {
    // Generate 3 alternative routes with different characteristics
    const directRoute = {
        name: 'Direct Route',
        description: 'Shortest distance between ports',
        points: interpolatePoints(origin, destination, 10)
    };
    
    // Northern route (higher latitude - often calmer in certain seasons)
    const latDiff = destination.lat - origin.lat;
    const northOffset = Math.abs(latDiff) * 0.2; // 20% latitude offset
    const northernRoute = {
        name: 'Northern Route',
        description: 'Higher latitude route - may avoid tropical storms',
        points: interpolatePointsWithOffset(origin, destination, 10, northOffset)
    };
    
    // Southern route (lower latitude)
    const southernRoute = {
        name: 'Southern Route',
        description: 'Lower latitude route - may have favorable currents',
        points: interpolatePointsWithOffset(origin, destination, 10, -northOffset)
    };
    
    return [directRoute, northernRoute, southernRoute];
}

function interpolatePointsWithOffset(origin, destination, numPoints, latOffset) {
    const points = [];
    const midLat = (origin.lat + destination.lat) / 2 + latOffset;
    const midLng = (origin.lng + destination.lng) / 2;
    
    // Create a curved route through the offset midpoint
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        let lat, lng;
        
        if (t <= 0.5) {
            // First half: origin to midpoint
            const t2 = t * 2;
            lat = origin.lat + (midLat - origin.lat) * t2;
            lng = origin.lng + (midLng - origin.lng) * t2;
        } else {
            // Second half: midpoint to destination
            const t2 = (t - 0.5) * 2;
            lat = midLat + (destination.lat - midLat) * t2;
            lng = midLng + (destination.lng - midLng) * t2;
        }
        
        points.push({ lat, lng });
    }
    
    return points;
}

async function getRouteWeatherData(points) {
    const weatherPromises = points.map(point => 
        weatherService.getWeatherForecast(point.lat, point.lng)
    );
    
    return await Promise.all(weatherPromises);
}

function evaluateRouteWeather(weatherData, vesselType) {
    let score = 0;
    const vesselLimits = getVesselLimits(vesselType);
    
    weatherData.forEach(pointData => {
        if (!pointData.daily) return;
        
        pointData.daily.forEach(day => {
            const windSpeed = (day.wind_speed || 0) * 1.94384;
            const waveHeight = estimateWaveHeight(day.wind_speed || 0);
            
            // Add penalty for exceeding limits
            if (windSpeed > vesselLimits.maxWind) {
                score += (windSpeed - vesselLimits.maxWind) * 10;
            }
            if (waveHeight > vesselLimits.maxWave) {
                score += (waveHeight - vesselLimits.maxWave) * 15;
            }
            
            // Add penalty for storms
            if (day.weather?.[0]?.main === 'Storm' || day.weather?.[0]?.main === 'Thunderstorm') {
                score += 50;
            }
            
            // Add penalty for poor visibility
            if ((day.visibility || 10000) < 1000) {
                score += 20;
            }
            
            // Bonus for favorable conditions
            if (windSpeed < 15 && waveHeight < 2) {
                score -= 5;
            }
        });
    });
    
    return Math.max(0, score); // Don't allow negative scores
}

function getVesselLimits(vesselType) {
    const limits = {
        cargo: { maxWind: 35, maxWave: 5 },
        tanker: { maxWind: 30, maxWave: 4 },
        container: { maxWind: 40, maxWave: 6 },
        passenger: { maxWind: 25, maxWave: 3 },
        yacht: { maxWind: 20, maxWave: 2.5 },
        fishing: { maxWind: 25, maxWave: 3.5 },
        naval: { maxWind: 45, maxWave: 7 },
        bulk: { maxWind: 35, maxWave: 5 },
        cruise: { maxWind: 22, maxWave: 3 }
    };
    
    return limits[vesselType] || limits.cargo;
}

function generateRouteAnalysis(route) {
    const analysis = {
        overall: 'Good',
        score: route.weatherScore,
        details: [],
        recommendations: [],
        estimatedDelays: 0
    };
    
    if (route.weatherScore < 50) {
        analysis.overall = 'Excellent';
        analysis.details.push('Ideal weather conditions throughout voyage');
        analysis.estimatedDelays = 0;
    } else if (route.weatherScore < 150) {
        analysis.overall = 'Good';
        analysis.details.push('Generally favorable conditions with minor rough weather');
        analysis.estimatedDelays = 2; // hours
    } else if (route.weatherScore < 300) {
        analysis.overall = 'Fair';
        analysis.details.push('Mixed conditions - careful planning required');
        analysis.recommendations.push('Monitor weather updates closely');
        analysis.estimatedDelays = 6;
    } else if (route.weatherScore < 500) {
        analysis.overall = 'Poor';
        analysis.details.push('Challenging weather conditions expected');
        analysis.recommendations.push('Consider postponing voyage');
        analysis.estimatedDelays = 12;
    } else {
        analysis.overall = 'Dangerous';
        analysis.details.push('Severe weather conditions - voyage not recommended');
        analysis.recommendations.push('Postpone voyage until conditions improve');
        analysis.estimatedDelays = 24;
    }
    
    return analysis;
}

function generateMarineSummary(marineData) {
    const summary = {
        overallConditions: 'Moderate',
        maxWindSpeed: 0,
                maxWaveHeight: 0,
        maxSwellHeight: 0,
        avgCurrentSpeed: 0,
        minVisibility: 10,
        worstSeaState: 0,
        recommendations: [],
        warnings: []
    };
    
    // Calculate statistics across all points
    marineData.forEach(data => {
        summary.maxWindSpeed = Math.max(summary.maxWindSpeed, data.current.windSpeed);
        summary.maxWaveHeight = Math.max(summary.maxWaveHeight, data.current.waveHeight);
        summary.maxSwellHeight = Math.max(summary.maxSwellHeight, data.current.swellHeight);
        summary.minVisibility = Math.min(summary.minVisibility, data.current.visibility);
        summary.worstSeaState = Math.max(summary.worstSeaState, data.current.seaState);
    });
    
    // Calculate average current speed
    const currentSpeeds = marineData.map(d => d.current.currentSpeed);
    summary.avgCurrentSpeed = average(currentSpeeds);
    
    // Determine overall conditions
    if (summary.maxWindSpeed > 40 || summary.maxWaveHeight > 6 || summary.worstSeaState >= 7) {
        summary.overallConditions = 'Severe';
        summary.warnings.push('⛔ Severe conditions detected - voyage not recommended');
        summary.recommendations.push('Wait for conditions to improve before departing');
    } else if (summary.maxWindSpeed > 25 || summary.maxWaveHeight > 4 || summary.worstSeaState >= 5) {
        summary.overallConditions = 'Rough';
        summary.warnings.push('⚠️ Rough conditions expected - experienced crew required');
        summary.recommendations.push('Ensure vessel is properly prepared for heavy weather');
        summary.recommendations.push('Brief crew on safety procedures');
    } else if (summary.maxWindSpeed < 15 && summary.maxWaveHeight < 2 && summary.worstSeaState <= 3) {
        summary.overallConditions = 'Calm';
        summary.recommendations.push('✅ Calm conditions - ideal for voyage');
        summary.recommendations.push('Good opportunity for crew training or maintenance');
    } else {
        summary.overallConditions = 'Moderate';
        summary.recommendations.push('Moderate conditions - standard voyage preparations');
    }
    
    // Visibility recommendations
    if (summary.minVisibility < 2) {
        summary.warnings.push('Poor visibility expected - radar watch required');
        summary.recommendations.push('Reduce speed in fog conditions');
        summary.recommendations.push('Post additional lookouts');
        summary.recommendations.push('Sound fog signals as per COLREGS');
    }
    
    // Current recommendations
    if (summary.avgCurrentSpeed > 2) {
        summary.recommendations.push(`Strong currents (avg ${summary.avgCurrentSpeed.toFixed(1)} kts) - adjust ETA calculations`);
    }
    
    // Format numbers for display
    summary.maxWindSpeed = Math.round(summary.maxWindSpeed);
    summary.maxWaveHeight = Math.round(summary.maxWaveHeight * 10) / 10;
    summary.maxSwellHeight = Math.round(summary.maxSwellHeight * 10) / 10;
    summary.avgCurrentSpeed = Math.round(summary.avgCurrentSpeed * 10) / 10;
    summary.minVisibility = Math.round(summary.minVisibility * 10) / 10;
    summary.worstSeaStateDesc = getSeaStateDescription(summary.worstSeaState);
    
    return summary;
}

function calculateHistoricalStats(historicalData) {
    if (!historicalData.weather || historicalData.weather.length === 0) {
        return {
            error: 'No historical data available'
        };
    }
    
    const stats = {
        avgWindSpeed: 0,
        avgWaveHeight: 0,
        avgSwellHeight: 0,
        avgCurrentSpeed: 0,
        stormDays: 0,
        calmDays: 0,
        roughDays: 0,
        fogDays: 0,
        recommendations: []
    };
    
    // Calculate statistics
    const windSpeeds = [];
    const waveHeights = [];
    const swellHeights = [];
    const currentSpeeds = [];
    
    historicalData.weather.forEach(day => {
        windSpeeds.push(day.windSpeed || 0);
        waveHeights.push(day.waveHeight || 0);
        swellHeights.push(day.swellHeight || 0);
        currentSpeeds.push(day.currentSpeed || 0);
        
        // Count condition days
        if (day.windSpeed > 34) stats.stormDays++;
        if (day.windSpeed < 10 && day.waveHeight < 1) stats.calmDays++;
        if (day.waveHeight > 4) stats.roughDays++;
        if (day.visibility < 1) stats.fogDays++;
    });
    
    stats.avgWindSpeed = Math.round(average(windSpeeds));
    stats.avgWaveHeight = Math.round(average(waveHeights) * 10) / 10;
    stats.avgSwellHeight = Math.round(average(swellHeights) * 10) / 10;
    stats.avgCurrentSpeed = Math.round(average(currentSpeeds) * 10) / 10;
    
    // Generate recommendations based on historical patterns
    const totalDays = historicalData.weather.length;
    const stormPercentage = (stats.stormDays / totalDays) * 100;
    const calmPercentage = (stats.calmDays / totalDays) * 100;
    
    if (stormPercentage > 20) {
        stats.recommendations.push('High storm frequency in this period - consider alternative timing');
    } else if (stormPercentage < 5) {
        stats.recommendations.push('Low storm risk based on historical data');
    }
    
    if (calmPercentage > 30) {
        stats.recommendations.push('Historically calm period - good for fuel efficiency');
    }
    
    if (stats.fogDays > totalDays * 0.15) {
        stats.recommendations.push('Frequent fog conditions - ensure radar is operational');
    }
    
    stats.summary = `Based on ${totalDays} days of historical data, ` +
                   `expect average conditions with ${stats.avgWindSpeed} kt winds ` +
                   `and ${stats.avgWaveHeight}m waves.`;
    
    return stats;
}

// Additional helper functions
function estimateWavePeriod(windSpeed) {
    // Simplified wave period estimation based on wind speed
    // Period typically increases with wave height
    const waveHeight = estimateWaveHeight(windSpeed);
    return Math.round(Math.sqrt(waveHeight * 5) * 10) / 10;
}

function estimateSwellPeriod(windSpeed) {
    // Swell periods are typically longer than wave periods
    const wavePeriod = estimateWavePeriod(windSpeed);
    return Math.round(wavePeriod * 1.5 * 10) / 10;
}

function estimateCurrentDirection(lat, lng) {
    // Simplified current direction estimation
    // In reality, this would use oceanographic data
    
    // Northern hemisphere - clockwise gyres
    if (lat > 0) {
        if (lng < -60) return 45;  // NE in western Atlantic
        if (lng > 60) return 225;  // SW in western Pacific
    }
    // Southern hemisphere - counterclockwise gyres
    else {
        if (lng < -60) return 315; // NW in western Atlantic
        if (lng > 60) return 135;  // SE in western Pacific
    }
    
    return 0; // Default north
}

// Export additional functions if needed
module.exports.processWeatherData = processWeatherData;
module.exports.generateRecommendations = generateRecommendations;