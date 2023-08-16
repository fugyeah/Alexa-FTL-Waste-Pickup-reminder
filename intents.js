import { geocodeAddress, fetchData, getNextDateForDay } from './utils';

const checkForPermissions = (handlerInput, scope) => {
    const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
    return permissions && permissions.scopes[scope].status === 'GRANTED';
};

const fetchUserAddress = async (handlerInput) => {
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
    return await deviceAddressServiceClient.getFullAddress(deviceId);
};

const constructFullAddress = (address) => {
    return `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
};

const fetchDataForLocation = async (fullAddress) => {
    const { latitude, longitude } = await geocodeAddress(fullAddress);
    return await Promise.all(Object.values(LAYERS).map(layerId => fetchData(layerId, latitude, longitude)));
};

const PickupScheduleHandler = {
    async canHandle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        return requestType === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetPickupIntent';
    },
    async handle(handlerInput) {
        try {
            if (!checkForPermissions(handlerInput, 'read::alexa:device:all:address')) {
                const speechText = "Please enable Location permissions in the Amazon Alexa app.";
                return handlerInput.responseBuilder
                    .speak(speechText)
                    .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                    .getResponse();
            }

            const address = await fetchUserAddress(handlerInput);
            const fullAddress = constructFullAddress(address);
            const results = await fetchDataForLocation(fullAddress);

            const speechText = constructResponse(results);

            const reminderClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            const recyclingReminderDate = getNextDateForDay(results[1].RECYCLDAY);
            recyclingReminderDate.setDate(recyclingReminderDate.getDate() - 1);
            recyclingReminderDate.setHours(19, 0, 0);

            const yardwasteReminderDate = getNextDateForDay(results[3].YARDDAY);
            yardwasteReminderDate.setDate(yardwasteReminderDate.getDate() - 1);
            yardwasteReminderDate.setHours(19, 0, 0);

            const createReminder = (date, text) => ({
                requestTime: new Date().toISOString(),
                trigger: {
                    type: "SCHEDULED_ABSOLUTE",
                    scheduledTime: date.toISOString(),
                    timeZoneId: "America/New_York"
                },
                alertInfo: {
                    spokenInfo: {
                        content: [{
                            locale: "en-US",
                            text: text
                        }]
                    }
                },
                pushNotification: {
                    status: "ENABLED"
                }
            });

            await reminderClient.createReminder(createReminder(recyclingReminderDate, "Remember to take out the trash and recycling for tomorrow's pickup!"));
            await reminderClient.createReminder(createReminder(yardwasteReminderDate, "Remember to take out the trash and yard waste for tomorrow's pickup!"));

            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } catch (error) {
            console.error(error);
            return handlerInput.responseBuilder
                .speak("Sorry, I encountered an error while fetching the pickup schedules. Please try again later.")
                .getResponse();
        }
    }
};

const SetRecyclingReminderIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetRecyclingReminderIntent';
    },
    async handle(handlerInput) {
        const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
        if (!(permissions && permissions.scopes['read::alexa:device:all:address'].status === 'GRANTED')) {
            const speechText = "Please enable Location permissions in the Amazon Alexa app.";
            return handlerInput.responseBuilder
                .speak(speechText)
                .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                .getResponse();
        }

        // Fetch the location
        const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
        const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
        const address = await deviceAddressServiceClient.getFullAddress(deviceId);
        const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
        const { latitude, longitude } = await geocodeAddress(fullAddress);

        // Get the recycling schedule
        const recyclingData = await fetchData(LAYERS["Recycling"], latitude, longitude);
        const recyclingDay = recyclingData.RECYCLDAY; // Assuming this gives you the day of the week (e.g., "Monday", "Tuesday", etc.)

        // Convert the day of the week to the next date for that day
        const nextRecyclingDate = getNextDateForDay(recyclingDay);
        // Set the reminder for 7 PM the evening before
        const reminderDate = new Date(nextRecyclingDate);
        reminderDate.setDate(reminderDate.getDate() - 1); // Subtract one day
        reminderDate.setHours(19, 0, 0); // Set time to 7 PM

        const reminderRequest = {
            requestTime: new Date().toISOString(),
            trigger: {
                type: "SCHEDULED_ABSOLUTE",
                scheduledTime: reminderDate.toISOString(),
                timeZoneId: "America/New_York"
            },
            alertInfo: {
                spokenInfo: {
                    content: [{
                        locale: "en-US",
                        text: "Remember to take out the recycling for tomorrow's pickup!"
                    }]
                }
            },
            pushNotification: {
                status: "ENABLED"
            }
        };

        const reminderClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        await reminderClient.createReminder(reminderRequest);

        const speechText = `I've set a reminder for you to take out the recycling at 7 PM the evening before your next scheduled pickup on ${recyclingDay}.`;
        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};
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

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speechText = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};
const GetTrashPickupIntentHandler = {
    canHandle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        return requestType === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetTrashPickupIntent';
    },
    async handle(handlerInput) {
        try {
            const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
            const addressPermission = permissions && permissions.scopes['read::alexa:device:all:address'].status === 'GRANTED';

            if (!addressPermission) {
                const speechText = "Please enable Location permissions in the Amazon Alexa app.";
                return handlerInput.responseBuilder
                    .speak(speechText)
                    .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                    .getResponse();
            }

            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
            const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
            const address = await deviceAddressServiceClient.getFullAddress(deviceId);

            const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
            const { latitude, longitude } = await geocodeAddress(fullAddress);

            const promises = Object.values(LAYERS).map(layerId => fetchData(layerId, latitude, longitude));
            const results = await Promise.all(promises);

            const speechText = constructResponse(results);

            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } catch (error) {
            console.error(error);
            return handlerInput.responseBuilder
                .speak("Sorry, I encountered an error while fetching the pickup schedules. Please try again later.")
                .getResponse();
        }
    }
};

const SetBulkReminderIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetBulkReminderIntent';
    },
    async handle(handlerInput) {
        const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
        if (!(permissions && permissions.scopes['alexa::alerts:reminders:skill:readwrite'].status === 'GRANTED')) {
            const speechText = "Please enable Reminders permissions in the Amazon Alexa app.";
            return handlerInput.responseBuilder
                .speak(speechText)
                .withAskForPermissionsConsentCard(['alexa::alerts:reminders:skill:readwrite'])
                .getResponse();
        }

        // Fetch the location
        const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
        const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
        const address = await deviceAddressServiceClient.getFullAddress(deviceId);
        const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
        const { latitude, longitude } = await geocodeAddress(fullAddress);

        // Get the bulk pickup schedule
        const bulkData = await fetchData(LAYERS["Bulk Trash"], latitude, longitude);
        const bulkDay = bulkData.BULKDAY; // Assuming this gives you the bulk pickup day in the format "3rd Tuesday" or "1st Friday"
        
        // Extract the day of the week and week number from the bulk pickup result
        const [weekNumber, dayOfWeek] = bulkDay.split(" ");
        
        // Calculate the reminder date based on the day of the week and week number
        const reminderDate = calculateBulkReminderDate(dayOfWeek, parseInt(weekNumber), -2); // Set reminder for 2 days before

        const reminderRequest = {
            // ... Reminder creation code here
        };

        const reminderClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        await reminderClient.createReminder(reminderRequest);

        const speechText = `I've set a reminder for you to put out bulk trash for pickup in two days on ${bulkDay}. Would you like to set another reminder?`;
        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

function calculateBulkReminderDate(dayOfWeek, weekNumber, daysBefore) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = new Date();
    const todayIdx = today.getDay();
    const targetIdx = days.indexOf(dayOfWeek);

    let daysToAdd = targetIdx - todayIdx;
    if (daysToAdd < 0) {
        daysToAdd += 7;
    }
    
    // Calculate the week offset based on the week number
    const weeksToAdd = weekNumber - 1;
    daysToAdd += 7 * weeksToAdd;
    
    // Adjust for the days before the reminder
    daysToAdd += daysBefore;

    const resultDate = new Date(today);
    resultDate.setDate(today.getDate() + daysToAdd);
    return resultDate;
}

const GetRecyclingPickupIntentHandler = {
    canHandle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        return requestType === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetRecyclingPickupIntent';
    },
    async handle(handlerInput) {
        try {
            const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
            const addressPermission = permissions && permissions.scopes['read::alexa:device:all:address'].status === 'GRANTED';

            if (!addressPermission) {
                const speechText = "Please enable Location permissions in the Amazon Alexa app.";
                return handlerInput.responseBuilder
                    .speak(speechText)
                    .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                    .getResponse();
            }

            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
            const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
            const address = await deviceAddressServiceClient.getFullAddress(deviceId);

            const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
            const { latitude, longitude } = await geocodeAddress(fullAddress);

            const promises = Object.values(LAYERS).map(layerId => fetchData(layerId, latitude, longitude));
            const results = await Promise.all(promises);

            const speechText = constructResponse(results);

            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } catch (error) {
            console.error(error);
            return handlerInput.responseBuilder
                .speak("Sorry, I encountered an error while fetching the pickup schedules. Please try again later.")
                .getResponse();
        }
    }
};

const GetYardWastePickupIntentHandler = {
    canHandle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        return requestType === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetYardWastePickupIntent';
    },
    async handle(handlerInput) {
        try {
            const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
            const addressPermission = permissions && permissions.scopes['read::alexa:device:all:address'].status === 'GRANTED';

            if (!addressPermission) {
                const speechText = "Please enable Location permissions in the Amazon Alexa app.";
                return handlerInput.responseBuilder
                    .speak(speechText)
                    .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                    .getResponse();
            }

            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
            const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
            const address = await deviceAddressServiceClient.getFullAddress(deviceId);

            const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
            const { latitude, longitude } = await geocodeAddress(fullAddress);

            const promises = Object.values(LAYERS).map(layerId => fetchData(layerId, latitude, longitude));
            const results = await Promise.all(promises);

            const speechText = constructResponse(results);

            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } catch (error) {
            console.error(error);
            return handlerInput.responseBuilder
                .speak("Sorry, I encountered an error while fetching the pickup schedules. Please try again later.")
                .getResponse();
        }
    }
};

const GetBulkPickupIntentHandler = {
    canHandle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        return requestType === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetBulkPickupIntent';
    },
    async handle(handlerInput) {
        try {
            const permissions = handlerInput.requestEnvelope.context.System.user.permissions;
            const addressPermission = permissions && permissions.scopes['read::alexa:device:all:address'].status === 'GRANTED';

            if (!addressPermission) {
                const speechText = "Please enable Location permissions in the Amazon Alexa app.";
                return handlerInput.responseBuilder
                    .speak(speechText)
                    .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
                    .getResponse();
            }

            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
            const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
            const address = await deviceAddressServiceClient.getFullAddress(deviceId);

            const fullAddress = `${address['addressLine1']} ${address['addressLine2']} ${address['city']} ${address['stateOrRegion']} ${address['postalCode']} ${address['countryCode']}`;
            const { latitude, longitude } = await geocodeAddress(fullAddress);

            const promises = Object.values(LAYERS).map(layerId => fetchData(layerId, latitude, longitude));
            const results = await Promise.all(promises);

            const speechText = constructResponse(results);

            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } catch (error) {
            console.error(error);
            return handlerInput.responseBuilder
                .speak("Sorry, I encountered an error while fetching the pickup schedules. Please try again later.")
                .getResponse();
        }
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speechText = 'You can ask me about your trash pickup schedule.';

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speechText = 'Sorry, I don’t know that. You can ask me about your trash pickup schedule.';
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Cleanup logic, if needed
        return handlerInput.responseBuilder.getResponse();
    }
};

module.exports = {
    PickupScheduleHandler,
    SetRecyclingReminderIntentHandler,
    CancelAndStopIntentHandler,
    HelpIntentHandler,
    SetBulkReminderIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    GetTrashPickupIntentHandler,
    GetRecyclingPickupIntentHandler,
    GetYardWastePickupIntentHandler,
    GetBulkPickupIntentHandler
};
