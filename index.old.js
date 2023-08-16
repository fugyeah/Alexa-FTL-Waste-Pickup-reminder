const Alexa = require('ask-sdk-core');
const axios = require('axios');

const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const BASE_URL = "https://gis.fortlauderdale.gov/arcgis/rest/services/Accela/Accela/MapServer/{}/query?geometry=longitude,latitude&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=*&f=json";
const LAYERS = {
    "Bulk Trash": 21,
    "Recycling": 22,
    "Trash": 23,
    "Yardwaste": 24
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

async function fetchData(layerId, latitude, longitude) {
    const url = BASE_URL.replace("{}", layerId).replace("longitude", longitude).replace("latitude", latitude);
    const response = await axios.get(url);
    return response.data.features[0].attributes;
}

const PickupScheduleHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetPickupIntent';  // Replace with your intent name
},
    async handle(handlerInput) {
        const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
        if (!(permissions && permissions.scopes['read::alexa:device:all:address'].status === 'GRANTED')) {
            // If permissions are not granted, remind the user.
            const speechText = "Please enable Location permissions in the Amazon Alexa app.";
            return handlerInput.responseBuilder
                .speak(speechText)
                .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                .getResponse();
        }
        if (permissions && permissions.scopes['alexa::alerts:reminders:skill:readwrite'].status === 'GRANTED') {
            const reminderRequest = {
                requestTime: new Date().toISOString(),
                trigger: {
                    type: "SCHEDULED_ABSOLUTE",
                    scheduledTime: new Date(new Date().setHours(21, 0, 0)).toISOString(),  // 9 PM daily
                    timeZoneId: "America/New_York",  // Adjust based on user's timezone
                    recurrence: { freq: "DAILY" }
                },
                alertInfo: {
                    spokenInfo: {
                        content: [{
                            locale: "en-US",
                            text: "Did you take your trash out?"
                        }]
                    }
                },
                pushNotification: {
                    status: "ENABLED"
                }
            };
            
            const reminderClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            await reminderClient.createReminder(reminderRequest);
            } else {
                // Optionally inform the user that they haven't granted reminder permissions, but don't return from the function.
                const reminderPermissionSpeech = "For a better experience, please enable Reminders permissions in the Amazon Alexa app.";
                handlerInput.responseBuilder.speak(reminderPermissionSpeech);
            }
        // If permission is granted, fetch the location.
        const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
        const apiEndpoint = handlerInput.requestEnvelope.context.System.apiEndpoint;
        const apiAccessToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
    
        const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
        const address = await deviceAddressServiceClient.getFullAddress(deviceId);
        
        try {
        // Assuming the service provides a latitude and longitude. If it provides a full address, you might need a separate service to geocode it.
        const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
        const { latitude, longitude } = await geocodeAddress(fullAddress);
        const promises = Object.values(LAYERS).map(layerId => fetchData(layerId, latitude, longitude));
        const results = await Promise.all(promises);

        let bulkDay = results[0].BULKDAY;  // Assuming results[0] corresponds to the Bulk Trash data
        let recyclingDay = results[1].RECYCLDAY;  // Assuming results[1] corresponds to the Recycling data
        let trashDays = results[2].TRASHDAY;  // Assuming results[2] corresponds to the Trash data
        let yardwasteDay = results[3].YARDDAY;  // Assuming results[3] corresponds to the Yardwaste data

        // Process the results and construct the response
        const speechText = constructResponse(results);

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    } catch (error) {
        console.error(error);
        return handlerInput.responseBuilder
            .speak("Sorry, I encountered an error while fetching the pickup schedules. Please try again later.")
            .getResponse();
        }}
};

function constructResponse(results) {
    const responses = [];

    if (results[0] && results[0].BULKDAY) {
        responses.push(`Bulk trash pickup is on the ${results[0].BULKDAY} of each month.`);
    }

    if (results[1] && results[1].RECYCLDAY) {
        responses.push(`Recycling pickup is on ${results[1].RECYCLDAY}.`);
    }

    if (results[2] && results[2].TRASHDAY) {
        responses.push(`Trash pickup is on ${results[2].TRASHDAY}.`);
    }

    if (results[3] && results[3].YARDDAY) {
        responses.push(`Yardwaste pickup is on ${results[3].YARDDAY}.`);
    }

    return responses.join(' ');
}


const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error.message}`);
        const speechText = "Sorry, I encountered an error. Please try again.";
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};


exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        PickupScheduleHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler
        // ... any other handlers you define
    )
    .addErrorHandlers(ErrorHandler)
    .lambda();

