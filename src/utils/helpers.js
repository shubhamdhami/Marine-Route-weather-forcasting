// Calculate distance between two points using Haversine formula
function calculateDistance(origin, destination) {
    const R = 3440; // Radius of Earth in nautical miles
    const lat1 = toRad(origin.lat);
    const lat2 = toRad(destination.lat);
    const deltaLat = toRad(destination.lat - origin.lat);
    const deltaLng = toRad(destination.lng - origin.lng);

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

// Convert degrees to radians
function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

// Convert radians to degrees
function toDeg(radians) {
    return radians * (180 / Math.PI);
}

// Interpolate points along a route
function interpolatePoints(origin, destination, numPoints, latOffset = 0) {
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const fraction = i / numPoints;
        const lat = origin.lat + (destination.lat - origin.lat) * fraction + latOffset;
        const lng = origin.lng + (destination.lng - origin.lng) * fraction;
        points.push({ lat, lng });
    }
    
    return points;
}

// Calculate bearing between two points
function calculateBearing(origin, destination) {
    const lat1 = toRad(origin.lat);
    const lat2 = toRad(destination.lat);
    const deltaLng = toRad(destination.lng - origin.lng);
    
    const x = Math.sin(deltaLng) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    
    const bearing = Math.atan2(x, y);
    
    return (toDeg(bearing) + 360) % 360;
}

// Format coordinates for display
function formatCoordinates(lat, lng) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

// Validate coordinates
function validateCoordinates(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
                      !isNaN(lat) && !isNaN(lng);
}

// Estimate wave height based on wind speed (simplified Beaufort scale approximation)
function estimateWaveHeight(windSpeed) {
    // Wind speed in m/s to wave height in meters
    // This is a simplified estimation - real wave height depends on many factors
    const windKnots = windSpeed * 1.94384;
    
    if (windKnots < 1) return 0;
    if (windKnots < 4) return 0.1;
    if (windKnots < 7) return 0.2;
    if (windKnots < 11) return 0.5;
    if (windKnots < 17) return 1.0;
    if (windKnots < 22) return 2.0;
    if (windKnots < 28) return 3.0;
    if (windKnots < 34) return 4.0;
    if (windKnots < 41) return 5.5;
    if (windKnots < 48) return 7.0;
    if (windKnots < 56) return 9.0;
    if (windKnots < 64) return 11.5;
    return 14.0;
}

// Calculate sea state based on wave height
function calculateSeaState(waveHeight) {
    // Douglas Sea Scale
    if (waveHeight < 0.1) return 0; // Calm (glassy)
    if (waveHeight < 0.5) return 1; // Calm (rippled)
    if (waveHeight < 1.25) return 2; // Smooth
    if (waveHeight < 2.5) return 3; // Slight
    if (waveHeight < 4.0) return 4; // Moderate
    if (waveHeight < 6.0) return 5; // Rough
    if (waveHeight < 9.0) return 6; // Very Rough
    if (waveHeight < 14.0) return 7; // High
    return 8; // Very High/Phenomenal
}

// Get sea state description
function getSeaStateDescription(seaState) {
    const descriptions = [
        'Calm (glassy)',
        'Calm (rippled)',
        'Smooth',
        'Slight',
        'Moderate',
        'Rough',
        'Very Rough',
        'High',
        'Very High',
        'Phenomenal'
    ];
    return descriptions[seaState] || 'Unknown';
}

// Calculate ETA based on distance and vessel speed
function calculateETA(distance, speed, departureTime = new Date()) {
    const hoursToDestination = distance / speed;
    const eta = new Date(departureTime);
    eta.setHours(eta.getHours() + hoursToDestination);
    return eta;
}

// Get wind direction as text
function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Calculate fuel consumption estimate
function estimateFuelConsumption(distance, vesselType, weatherConditions) {
    // Base consumption rates (tons per nautical mile)
    const baseRates = {
        cargo: 0.3,
        tanker: 0.35,
        container: 0.4,
        passenger: 0.25,
        yacht: 0.1
    };
    
    let consumption = distance * (baseRates[vesselType] || 0.3);
    
    // Adjust for weather conditions
    const avgWindSpeed = weatherConditions.reduce((sum, day) => sum + day.windSpeed, 0) / weatherConditions.length;
    const avgWaveHeight = weatherConditions.reduce((sum, day) => sum + day.waveHeight, 0) / weatherConditions.length;
    
    // Increase consumption for rough conditions
    if (avgWindSpeed > 25) consumption *= 1.3;
    else if (avgWindSpeed > 15) consumption *= 1.15;
    
    if (avgWaveHeight > 4) consumption *= 1.25;
    else if (avgWaveHeight > 2) consumption *= 1.1;
    
    return Math.round(consumption * 10) / 10;
}

// Get route waypoints for great circle navigation
function getGreatCircleWaypoints(origin, destination, numWaypoints = 10) {
    const waypoints = [];
    const lat1 = toRad(origin.lat);
    const lon1 = toRad(origin.lng);
    const lat2 = toRad(destination.lat);
    const lon2 = toRad(destination.lng);
    
    const d = 2 * Math.asin(Math.sqrt(
        Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
    ));
    
    for (let i = 0; i <= numWaypoints; i++) {
        const f = i / numWaypoints;
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);
        
        const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
        const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
        const z = A * Math.sin(lat1) + B * Math.sin(lat2);
        
        const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
        const lon = Math.atan2(y, x);
        
        waypoints.push({
            lat: toDeg(lat),
            lng: toDeg(lon),
            distance: f * calculateDistance(origin, destination)
        });
    }
    
    return waypoints;
}

// Check if route crosses land (simplified check)
function checkLandCrossing(origin, destination) {
    // This is a simplified check - in production, you'd use a proper maritime routing API
    // For now, just check if route crosses known land masses
    
    const lat1 = origin.lat;
    const lon1 = origin.lng;
    const lat2 = destination.lat;
    const lon2 = destination.lng;
    
    // Simple check for Atlantic crossing
    if ((lon1 < -60 && lon2 > -10) || (lon1 > -10 && lon2 < -60)) {
        // Crossing Atlantic, likely safe
        return false;
    }
    
    // Check for Mediterranean
    if (lat1 > 30 && lat1 < 45 && lat2 > 30 && lat2 < 45) {
        if (lon1 > -10 && lon1 < 40 && lon2 > -10 && lon2 < 40) {
            // Both points in Mediterranean region
            return false;
        }
    }
    
    // Default to safe for now
    return false;
}
function estimateSwellHeight(windSpeed) {
    // Simplified swell height estimation (typically 30-50% of wave height)
    const waveHeight = estimateWaveHeight(windSpeed);
    return waveHeight * 0.4;
}
function estimateCurrentSpeed(lat, lon) {
    // Simplified ocean current estimation
    // In reality, this would use oceanographic data
    // Major currents typically range from 0.5 to 2.5 knots
    // Atlantic Gulf Stream region
    if (lat > 25 && lat < 45 && lon > -80 && lon < -60) {
        return 2.0 + Math.random() * 0.5;
    }
    // Equatorial currents
    if (lat > -10 && lat < 10) {
        return 1.5 + Math.random() * 0.5;
    }
    // Default ocean current
    return 0.5 + Math.random() * 1.0;
}

// Export all functions
module.exports = {
    calculateDistance,
    toRad,
    toDeg,
    interpolatePoints,
    calculateBearing,
    formatCoordinates,
    validateCoordinates,
    estimateWaveHeight,
    calculateSeaState,
    getSeaStateDescription,
    calculateETA,
    getWindDirection,
    estimateFuelConsumption,
    getGreatCircleWaypoints,
    checkLandCrossing,
    estimateSwellHeight,
    estimateCurrentSpeed
};