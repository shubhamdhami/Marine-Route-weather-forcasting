function calculateMarineRoute(source, destination) {
    const waypoints = [];
    const numWaypoints = 10;
    
    // Add origin
    waypoints.push({
        lat: parseFloat(source.lat),
        lng: parseFloat(source.lng),
        name: source.name || 'Origin'
    });
    
    // Calculate intermediate points
    for (let i = 1; i < numWaypoints - 1; i++) {
        const fraction = i / (numWaypoints - 1);
        const waypoint = interpolateGreatCircle(source, destination, fraction);
        waypoint.name = `Waypoint ${i}`;
        waypoints.push(waypoint);
    }
    
    // Add destination
    waypoints.push({
        lat: parseFloat(destination.lat),
        lng: parseFloat(destination.lng),
        name: destination.name || 'Destination'
    });
    
    const totalDistance = calculateTotalDistance(waypoints);
    const estimatedHours = totalDistance / 15; // 15 knots average
    
    return {
        waypoints,
        totalDistance: totalDistance.toFixed(1),
        estimatedDuration: `${Math.floor(estimatedHours / 24)}d ${Math.round(estimatedHours % 24)}h`
    };
}

function interpolateGreatCircle(start, end, fraction) {
    const lat1 = toRadians(start.lat);
    const lng1 = toRadians(start.lng);
    const lat2 = toRadians(end.lat);
    const lng2 = toRadians(end.lng);
    
    const d = 2 * Math.asin(Math.sqrt(
        Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng2 - lng1) / 2), 2)
    ));
    
    const a = Math.sin((1 - fraction) * d) / Math.sin(d);
    const b = Math.sin(fraction * d) / Math.sin(d);
    
    const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
    const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);
    
    return {
        lat: toDegrees(lat),
        lng: toDegrees(lng)
    };
}

function calculateDistance(point1, point2) {
    const R = 3440.065; // Earth's radius in nautical miles
    const lat1 = toRadians(point1.lat);
    const lat2 = toRadians(point2.lat);
    const deltaLat = toRadians(point2.lat - point1.lat);
    const deltaLng = toRadians(point2.lng - point1.lng);
    
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

function calculateTotalDistance(waypoints) {
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        total += calculateDistance(waypoints[i], waypoints[i + 1]);
    }
    return total;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function toDegrees(radians) {
    return radians * (180 / Math.PI);
}

module.exports = {
    calculateMarineRoute,
    calculateDistance
};