# Trash Pickup Reminder Alexa Skill

This is an Alexa skill that helps users set reminders for their trash pickup schedules, including trash, recycling, yard waste, and bulk pickup.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Handlers](#handlers)
- [Interaction Model](#interaction-model)
- [License](#license)

## Overview

This Alexa skill provides users with the ability to inquire about their trash pickup schedules and set reminders for different types of pickups.

The skill is built using Node.js and the Alexa Skills Kit SDK. It interacts with the user's device address, reminder service, and external APIs to fetch pickup schedule data and set reminders.

## Prerequisites

- Node.js (version X or higher)
- An Amazon Developer account
- An AWS account
- An Alexa-enabled device or simulator
- API keys (Google Maps API and others as required)

## Installation

1. Clone or download this repository.
2. Navigate to the project directory in your terminal.
3. Run `npm install` to install the necessary dependencies.
4. Configure your API keys and other environment variables in the `.env` file.

## Usage

1. Deploy the skill code to your AWS Lambda function.
2. Create a new Alexa skill in the Amazon Developer Console.
3. Define the interaction model (intents, slots, etc.) in the skill's JSON configuration.
4. Link the skill to your AWS Lambda function.
5. Test the skill using an Alexa-enabled device or simulator.

## Handlers

- `PickupScheduleHandler`: Handles the user's request for pickup schedules (trash, recycling, yard waste, and bulk).
- `SetRecyclingReminderIntentHandler`: Handles setting a reminder for recycling pickup.
- `SetBulkReminderIntentHandler`: Handles setting a reminder for bulk pickup.
- `CancelAndStopIntentHandler`: Handles stopping or canceling the interaction.
- `HelpIntentHandler`: Handles providing help to the user.
- Other handlers for fallback and session ended requests.

## Interaction Model

Define the interaction model for your skill in the Amazon Developer Console. Map the user's utterances to the corresponding intents.

### Intents

- `GetPickupIntent`: Get pickup schedules for trash, recycling, yard waste, and bulk.
- `SetRecyclingReminderIntent`: Set a reminder for recycling pickup.
- `SetBulkReminderIntent`: Set a reminder for bulk pickup.
- Other standard intents (e.g., `AMAZON.HelpIntent`, `AMAZON.CancelIntent`, etc.).

### Slots

- Define any necessary slots for user inputs (e.g., pickup types, dates).

## License

This project is licensed under the [MIT License](LICENSE).
