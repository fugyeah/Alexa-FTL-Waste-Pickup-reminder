const Alexa = require('ask-sdk-core');
const axios = require('axios');
const { PickupScheduleHandler, SetRecyclingReminderIntentHandler, SetBulkReminderIntentHandler, CancelAndStopIntentHandler, HelpIntentHandler, FallbackIntentHandler, SessionEndedRequestHandler } = require('./intents'); // Import handlers from intents.js

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
        SessionEndedRequestHandler,
        SetRecyclingReminderIntentHandler,
        SetBulkReminderIntentHandler
        // ... any other handlers you define
    )
    .addErrorHandlers(ErrorHandler)
    .lambda();

