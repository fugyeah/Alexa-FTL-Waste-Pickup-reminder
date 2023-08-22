import { geocodeAddress, fetchData, LAYERS, constructResponse, getNextDateForDay } from './utils';


// Utility Functions
const checkAndHandlePermissions = (handlerInput, scope) => {
    if (!checkForPermissions(handlerInput, scope)) {
        const speechText = "Please enable Location permissions in the Amazon Alexa app.";
        return handlerInput.responseBuilder
            .speak(speechText)
            .withAskForPermissionsConsentCard([scope])
            .getResponse();
    }
    return null;
};

const fetchDataForUserAddress = async (handlerInput) => {
    const address = await fetchUserAddress(handlerInput);
    const fullAddress = constructFullAddress(address);
    return await fetchDataForLocation(fullAddress);
};

const handleError = (handlerInput, error) => {
    console.error(`Error processing request by user ${handlerInput.requestEnvelope.context.System.user.userId} for intent ${Alexa.getIntentName(handlerInput.requestEnvelope)}: ${error.message}`);
    return handlerInput.responseBuilder
        .speak("Sorry, I encountered an error. Please try again later.")
        .getResponse();
};

// Base Handler Class
class BaseIntentHandler {
    constructor(intentName) {
        this.intentName = intentName;
    }

    canHandle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        return requestType === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === this.intentName;
    }

    handle(handlerInput) {
        throw new Error("Subclasses must implement handle method");
    }
}


// Intent Handlers
class PickupScheduleHandler extends BaseIntentHandler {
    constructor() {
        super('PickupScheduleHandler');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Extract the two trash pickup days
            const [day1, day2] = results[0].TRASHDAY.split(' & ');
            
            // Set reminders for both days
            await setReminderForDay(handlerInput, day1, "Trash pickup reminder for today!");
            await setReminderForDay(handlerInput, day2, "Trash pickup reminder for today!");

            const speechText = `Reminders set for trash pickups on ${day1} and ${day2}.`;

            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}


class SetRecyclingReminderIntentHandler extends BaseIntentHandler {
    constructor() {
        super('SetRecyclingReminderIntent');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Get the recycling day
            const recyclingDay = results[1].RECYCLDAY;

            // Determine the next recycling date and set a reminder for 7 PM the evening before
            const nextRecyclingDate = getNextDateForDay(recyclingDay);
            const reminderDate = new Date(nextRecyclingDate);
            reminderDate.setDate(reminderDate.getDate() - 1);
            reminderDate.setHours(19, 0, 0);

            const reminderClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            await reminderClient.createReminder(createReminder(reminderDate, "Remember to take out the recycling for tomorrow's pickup!"));

            const speechText = `I've set a reminder for you to take out the recycling at 7 PM the evening before your next scheduled pickup on ${recyclingDay}.`;
            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}

class GetTrashPickupIntentHandler extends BaseIntentHandler {
    constructor() {
        super('GetTrashPickupIntent');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Extract the two trash pickup days
            const [day1, day2] = results[0].TRASHDAY.split(' & ');
            
            // Determine the next trash pickup dates for both days
            const nextPickupDate1 = getNextDateForDay(day1);
            const nextPickupDate2 = getNextDateForDay(day2);
            
            // Construct the speech response
            const speechText = `The next trash pickups are on ${nextPickupDate1.toDateString()} and ${nextPickupDate2.toDateString()}.`;

            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}


class GetRecyclingPickupIntentHandler extends BaseIntentHandler {
    constructor() {
        super('GetRecyclingPickupIntent');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Construct the speech response
            const speechText = `Recycling pickup is on ${results[1].RECYCLDAY}.`;

            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}

class GetYardWastePickupIntentHandler extends BaseIntentHandler {
    constructor() {
        super('GetYardWastePickupIntent');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Construct the speech response
            const speechText = `Yardwaste pickup is on ${results[3].YARDDAY}.`;

            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}

class GetBulkPickupIntentHandler extends BaseIntentHandler {
    constructor() {
        super('GetBulkPickupIntent');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Extract week number and day of week from BULKDAY (assuming format "1st Tuesday")
            const [_, weekNumStr, dayOfWeek] = results[0].BULKDAY.match(/(\d)(?:st|nd|rd|th) (\w+)/);
            const weekNumber = parseInt(weekNumStr, 10);

            // Determine the next bulk pickup date
            const nextPickupDate = calculateBulkReminderDate(dayOfWeek, weekNumber, 0);
            
            // Construct the speech response
            const speechText = `The next bulk trash pickup is on ${nextPickupDate.toDateString()}.`;

            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}

class SetBulkReminderIntentHandler extends BaseIntentHandler {
    constructor() {
        super('SetBulkReminderIntent');
    }

    async handle(handlerInput) {
        try {
            // Check permissions and fetch data
            const permissionResponse = checkAndHandlePermissions(handlerInput, 'read::alexa:device:all:address');
            if (permissionResponse) return permissionResponse;

            const results = await fetchDataForUserAddress(handlerInput);

            // Extract week number and day of week from BULKDAY (assuming format "1st Tuesday")
            const [_, weekNumStr, dayOfWeek] = results[0].BULKDAY.match(/(\d)(?:st|nd|rd|th) (\w+)/);
            const dayMapping = {
                'Sunday': 'SU',
                'Monday': 'MO',
                'Tuesday': 'TU',
                'Wednesday': 'WE',
                'Thursday': 'TH',
                'Friday': 'FR',
                'Saturday': 'SA'
            };
            const dayAbbreviation = dayMapping[dayOfWeek];
            const weekNumber = parseInt(weekNumStr, 10);

            // Determine the next bulk pickup date
            const nextBulkPickupDate = calculateBulkReminderDate(dayOfWeek, weekNumber, 0);

            // Set a reminder for just the upcoming bulk pickup date
            const reminderDate = new Date(nextBulkPickupDate);
            reminderDate.setDate(reminderDate.getDate() - 1);
            reminderDate.setHours(19, 0, 0);  // 7 PM the evening before

            const reminderClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            await reminderClient.createReminder(createReminder(reminderDate, "Remember to set out your bulk trash for tomorrow's pickup!"));

            // Check if the user has already been asked about setting a recurring reminder
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            if (!sessionAttributes.askedRecurringReminder) {
                sessionAttributes.askedRecurringReminder = true;
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                
                const speechText = `I've set a reminder for you to set out your bulk trash at 7 PM the evening before your next scheduled pickup on ${nextBulkPickupDate.toDateString()}. Would you like me to set a recurring reminder every month for bulk trash pickup?`;
                return handlerInput.responseBuilder.speak(speechText).reprompt(speechText).getResponse();
            }

            // Extract user's response
            const userResponse = Alexa.getSlotValue(handlerInput.requestEnvelope, 'AffirmativeOrNegative');

            if (userResponse === 'yes') {
                // Schedule the recurring reminder
                const reminderDate = calculateBulkReminderDate(dayOfWeek, parseInt(weekNumStr, 10), 0);
                const reminder = {
                    requestTime: new Date().toISOString(),
                    trigger: {
                        type: 'SCHEDULED_ABSOLUTE',
                        scheduledTime: reminderDate.toISOString(),
                        recurrence: {
                            freq: 'MONTHLY',
                            byDay: [dayAbbreviation],
                            interval: 1
                        }
                    },
                    alertInfo: {
                        spokenInfo: {
                            content: [{
                                locale: 'en-US',
                                text: 'Remember to set out your bulk trash for tomorrow\'s pickup!'
                            }]
                        }
                    },
                    pushNotification: {
                        status: 'ENABLED'
                    }
                };
                await reminderClient.createReminder(reminder);

                const speechText = `I've set a recurring reminder for you to take out the bulk trash at 7 PM the evening before your scheduled pickup on the ${weekNumStr} ${dayOfWeek} of each month.`;
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            }

            const speechText = `Okay, I've only set a one-time reminder for your next bulk trash pickup.`;
            return handlerInput.responseBuilder.speak(speechText).getResponse();

        } catch (error) {
            return handleError(handlerInput, error);
        }
    }
}


class CancelAndStopIntentHandler extends BaseIntentHandler {
    constructor() {
        super(['AMAZON.CancelIntent', 'AMAZON.StopIntent']);
    }

    handle(handlerInput) {
        const speechText = 'Goodbye!';
        return handlerInput.responseBuilder.speak(speechText).getResponse();
    }
}

class HelpIntentHandler extends BaseIntentHandler {
    constructor() {
        super('AMAZON.HelpIntent');
    }

    handle(handlerInput) {
        const speechText = 'You can ask me about your trash pickup schedule.';
        return handlerInput.responseBuilder.speak(speechText).reprompt(speechText).getResponse();
    }
}

class FallbackIntentHandler extends BaseIntentHandler {
    constructor() {
        super('AMAZON.FallbackIntent');
    }

    handle(handlerInput) {
        const speechText = 'Sorry, I don’t know that. You can ask me about your trash pickup schedule.';
        return handlerInput.responseBuilder.speak(speechText).reprompt(speechText).getResponse();
    }
}


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

