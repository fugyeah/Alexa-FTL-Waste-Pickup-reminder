const axios = require('axios');

const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const LAYERS = {
    "Fort Lauderdale": {
        "Bulk Trash": 21,
        "Recycling": 22,
        "Trash": 23,
        "Yardwaste": 24
    },
    "Tamarac": {
        "Bulk Trash": "Bulk_",
        "Recycling": "Recycle",
        "Trash": "Garbage"
    }
};

const ENDPOINTS = {
    'FORT_LAUDERDALE': "https://gis.fortlauderdale.gov/arcgis/rest/services/Accela/Accela/MapServer/{}/query?geometry=longitude,latitude&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=*&f=json",
    'TAMARAC': "https://gis.tamarac.org/server/rest/services/General_Data/Recycling_and_Trash_Zones/FeatureServer/0?f=pjson"
};

async function geocodeAddress(address) {
    const url = `${GEOCODING_API_URL}?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(url);
    if (response.data.status !== 'OK' || !response.data.results.length) {
        throw new Error('Failed to geocode address');
    }
    const location = response.data.results[0].geometry.location;
    return { latitude: location.lat, longitude: location.lng };
}

async function determineEndpoint(address) {
    const geocodedData = await geocodeAddress(address);
    if (geocodedData.formatted_address.includes('Fort Lauderdale')) {
        return { endpoint: ENDPOINTS.FORT_LAUDERDALE, city: 'Fort Lauderdale' };
    } else if (geocodedData.formatted_address.includes('Tamarac')) {
        return { endpoint: ENDPOINTS.TAMARAC, city: 'Tamarac' };
    } else {
        throw new Error('Unsupported region');
    }
}

async function fetchData(city, layerName, latitude, longitude) {
    let url;
    if (city === 'Fort Lauderdale') {
        url = ENDPOINTS.FORT_LAUDERDALE.replace("{}", LAYERS["Fort Lauderdale"][layerName]).replace("longitude", longitude).replace("latitude", latitude);
    } else if (city === 'Tamarac') {
        url = ENDPOINTS.TAMARAC.replace("{}", LAYERS["Tamarac"][layerName]).replace("longitude", longitude).replace("latitude", latitude);
    } else {
        throw new Error('Unsupported city');
    }
    const response = await axios.get(url);
    if (!response.data || !response.data.features || !response.data.features[0]) {
        throw new Error('Unexpected data from GIS service');
    }
    return response.data.features[0].attributes;
}


    function constructResponse(results) {
        const responseMapping = {
            'BULKDAY': 'Bulk trash pickup is on the',
            'RECYCLDAY': 'Recycling pickup is on',
            'TRASHDAY': 'Trash pickup is on',
            'YARDDAY': 'Yardwaste pickup is on'
        };
        
        let responses = [];
    
        for (let result of results) {
            for (let key in result) {
                if (responseMapping[key]) {
                    if (key === 'BULKDAY') {
                        responses.push(`${responseMapping[key]} ${result[key]} of each month.`);
                    } else {
                        responses.push(`${responseMapping[key]} ${result[key]}.`);
                    }
                }
            }
        }
    
        return responses.join(' ');
    }

function getNextDateForDay(dayOfWeek) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = new Date();
    const todayIdx = today.getDay();
    const targetIdx = days.indexOf(dayOfWeek);

    let daysToAdd = targetIdx - todayIdx;
    if (daysToAdd <= 0) {
        daysToAdd += 7;
    }

    const resultDate = new Date(today);
    resultDate.setDate(today.getDate() + daysToAdd);
    return resultDate;
}

module.exports = {
    geocodeAddress,
    fetchData,
    getNextDateForDay,
    constructResponse,
    ENDPOINTS,
    LAYERS
};