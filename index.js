import Alexa from 'ask-sdk-core';
import axios from 'axios';
import { 
    PickupScheduleHandler, 
    SetRecyclingReminderIntentHandler, 
    SetBulkReminderIntentHandler, 
    CancelAndStopIntentHandler, 
    HelpIntentHandler, 
    FallbackIntentHandler, 
    SessionEndedRequestHandler 
} from './intents'; // Import handlers from intents.js

const NetworkErrorHandler = {
    canHandle(handlerInput, error) {
        return error instanceof axios.NetworkError; // Assuming axios is used for network requests
    },
    handle(handlerInput, error) {
        console.error(`Network error: ${error.stack}`);
        const speechText = "Sorry, I'm having trouble connecting to the server. Please try again later.";
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const GenericErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.error(`Error handled: ${error.stack}`);
        const speechText = "Sorry, I encountered an unexpected error. Please try again.";
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
    .addErrorHandlers(
        NetworkErrorHandler,
        GenericErrorHandler
    )
    .lambda();

