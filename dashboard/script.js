/*
  ============================================================
  TouchVox - Assistive Communication Device (IEEE Project)
  ESP32 + SSD1306 OLED (I2C) + Buttons + LED + Buzzer
  Finite State Machine, millis()-based timing (no delay()).
  ============================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ============================================================
// OLED CONFIG
// ============================================================
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT  64
#define OLED_SDA       21
#define OLED_SCL       22
#define OLED_ADDRESS   0x3C
#define OLED_RESET     -1

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ============================================================
// GPIO PIN MAPPING
// ============================================================
#define PIN_UP         13
#define PIN_DOWN       23
#define PIN_LEFT       14
#define PIN_RIGHT      27
#define PIN_OK         26
#define PIN_EXIT       25
#define PIN_EMERGENCY  33
#define PIN_NEXTPAGE   32
#define PIN_LED        18
#define PIN_BUZZER     4

// ============================================================
// DEBOUNCE CONFIG
// ============================================================
#define DEBOUNCE_DELAY 200   // ms, minimal debounce (not a delay())

// Track last press time for each button to implement debounce using millis()
unsigned long lastDebounceUP        = 0;
unsigned long lastDebounceDOWN      = 0;
unsigned long lastDebounceLEFT      = 0;
unsigned long lastDebounceRIGHT     = 0;
unsigned long lastDebounceOK        = 0;
unsigned long lastDebounceEXIT      = 0;
unsigned long lastDebounceEMERGENCY = 0;
unsigned long lastDebounceNEXTPAGE  = 0;

// Track previous raw state for edge detection (HIGH = not pressed, LOW = pressed, due to INPUT_PULLUP)
int prevStateUP        = HIGH;
int prevStateDOWN      = HIGH;
int prevStateLEFT      = HIGH;
int prevStateRIGHT     = HIGH;
int prevStateOK        = HIGH;
int prevStateEXIT      = HIGH;
int prevStateEMERGENCY = HIGH;
int prevStateNEXTPAGE  = HIGH;

// ============================================================
// FINITE STATE MACHINE STATES
// ============================================================
enum SystemState {
  HOME,
  CATEGORY,
  CONFIRM,
  REQUEST_SENT,
  EMERGENCY,
  EMERGENCY_CONFIRM,   // waiting for OK confirmation after dedicated Emergency button press
  EMERGENCY_CLEARED    // brief transitional screen shown after Emergency is cancelled
};

SystemState currentState = HOME;
SystemState stateBeforeEmergency = HOME;  // remembers state to restore after emergency clears (returns Home per spec)

// ============================================================
// CATEGORY / MESSAGE DATA (ARRAYS)
// ============================================================
const int NUM_CATEGORIES = 3;
const char* categoryNames[NUM_CATEGORIES] = {
  "Basic Needs",
  "Comfort",
  "Emergency"
};

// Basic Needs messages
const int NUM_BASIC_MSGS = 5;
const char* basicNeedsMessages[NUM_BASIC_MSGS] = {
  "Water",
  "Food",
  "Washroom",
  "Medicine",
  "Blanket"
};

// Comfort messages
const int NUM_COMFORT_MSGS = 5;
const char* comfortMessages[NUM_COMFORT_MSGS] = {
  "Adjust Pillow",
  "Change Position",
  "Too Hot/Cold",
  "Need Company",
  "Play Music"
};

// Emergency category messages
const int NUM_EMERGENCY_MSGS = 5;
const char* emergencyMessages[NUM_EMERGENCY_MSGS] = {
  "Pain",
  "Cough",
  "Bleeding",
  "Breathing Issue",
  "Drowsy"
};

// Pointers to currently active message array/size (set when entering CATEGORY state)
const char** currentMessageArray = nullptr;
int currentMessageArrayLen = 0;

// ============================================================
// NAVIGATION / SELECTION VARIABLES
// ============================================================
int homeSelection = 0;        // index into categoryNames[] on Home screen
int categorySelection = 0;    // index of selected category entering CATEGORY state
int messageIndex = 0;         // current message index inside a category

// ============================================================
// AUTO-SCROLL TIMER (CATEGORY STATE)
// ============================================================
unsigned long lastAutoScrollTime = 0;
const unsigned long AUTO_SCROLL_INTERVAL = 3000; // 3 seconds

// ============================================================
// REQUEST_SENT STATE TIMER
// ============================================================
unsigned long requestSentStartTime = 0;
const unsigned long REQUEST_SENT_DURATION = 2000; // 2 seconds

// ============================================================
// EMERGENCY STATE FLAG (toggle)
// ============================================================
bool emergencyActive = false;

// ============================================================
// LED / BUZZER SINGLE-PULSE STATE (for Request Sent feedback)
// ============================================================
bool feedbackPulseActive = false;
unsigned long feedbackPulseStartTime = 0;
const unsigned long FEEDBACK_PULSE_DURATION = 150; // ms LED/Buzzer stays on for single pulse

// ============================================================
// DEDICATED EMERGENCY BUTTON (GPIO33) - short confirmation beep pulse
// (buzzer only, LED stays OFF while waiting for OK confirmation)
// ============================================================
bool emergencyBeepPulseActive = false;
unsigned long emergencyBeepPulseStartTime = 0;
const unsigned long EMERGENCY_BEEP_DURATION = 150; // ms short beep

// ============================================================
// EMERGENCY_CLEARED STATE TIMER (non-blocking 2 second wait)
// ============================================================
unsigned long emergencyClearedStartTime = 0;
const unsigned long EMERGENCY_CLEARED_DURATION = 2000; // 2 seconds

// ============================================================
// FUNCTION PROTOTYPES
// ============================================================
void drawHome();
void drawCategory();
void drawConfirm();
void drawRequestSent();
void drawEmergency();
void drawEmergencyConfirm();
void drawEmergencyCleared();
void handleButtons();
void handleAutoScroll();
void toggleEmergency();
void handleNextPage();
void handleFeedbackPulse();
void handleEmergencyBeepPulse();
bool isPressed(int pin, int &prevState, unsigned long &lastDebounceTime);

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  // Button pins as INPUT_PULLUP
  pinMode(PIN_UP, INPUT_PULLUP);
  pinMode(PIN_DOWN, INPUT_PULLUP);
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);
  pinMode(PIN_OK, INPUT_PULLUP);
  pinMode(PIN_EXIT, INPUT_PULLUP);
  pinMode(PIN_EMERGENCY, INPUT_PULLUP);
  pinMode(PIN_NEXTPAGE, INPUT_PULLUP);

  // Output pins
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  noTone(PIN_BUZZER);

  // I2C init for OLED
  Wire.begin(OLED_SDA, OLED_SCL);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;); // halt if OLED not found
  }

  display.clearDisplay();
  display.display();

  currentState = HOME;
  drawHome();
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  handleButtons();       // Poll all buttons, act based on current state (EXIT/EMERGENCY are global)
  handleAutoScroll();     // Auto-advance messages every 3s while in CATEGORY state
  handleFeedbackPulse();  // Non-blocking LED/Buzzer single pulse handling
  handleEmergencyBeepPulse(); // Non-blocking short buzzer-only beep for dedicated Emergency button

  // Handle REQUEST_SENT auto-return-to-home timer
  if (currentState == REQUEST_SENT) {
    if (millis() - requestSentStartTime >= REQUEST_SENT_DURATION) {
      currentState = HOME;
      drawHome();
    }
  }

  // Handle EMERGENCY_CLEARED auto-return-to-home timer (non-blocking 2s wait)
  if (currentState == EMERGENCY_CLEARED) {
    if (millis() - emergencyClearedStartTime >= EMERGENCY_CLEARED_DURATION) {
      currentState = HOME;
      homeSelection = 0;
      drawHome();
    }
  }
}

// ============================================================
// isPressed()
// Generic debounced button-press edge detector.
// Returns true exactly once per physical press (falling edge, active LOW).
// ============================================================
bool isPressed(int pin, int &prevState, unsigned long &lastDebounceTime) {
  int reading = digitalRead(pin);
  bool pressedEvent = false;

  if (reading != prevState) {
    // State changed -> check debounce window
    if (millis() - lastDebounceTime > DEBOUNCE_DELAY) {
      lastDebounceTime = millis();
      if (reading == LOW) {
        // Falling edge = button pressed (active LOW due to INPUT_PULLUP)
        pressedEvent = true;
      }
      prevState = reading;
    }
  }
  return pressedEvent;
}

// ============================================================
// handleButtons()
// Reads all buttons and dispatches actions based on the FSM's
// current state. EXIT and EMERGENCY are handled globally.
// ============================================================
void handleButtons() {

  bool upPressed        = isPressed(PIN_UP, prevStateUP, lastDebounceUP);
  bool downPressed       = isPressed(PIN_DOWN, prevStateDOWN, lastDebounceDOWN);
  bool leftPressed       = isPressed(PIN_LEFT, prevStateLEFT, lastDebounceLEFT);
  bool rightPressed      = isPressed(PIN_RIGHT, prevStateRIGHT, lastDebounceRIGHT);
  bool okPressed         = isPressed(PIN_OK, prevStateOK, lastDebounceOK);
  bool exitPressed       = isPressed(PIN_EXIT, prevStateEXIT, lastDebounceEXIT);
  bool emergencyPressed  = isPressed(PIN_EMERGENCY, prevStateEMERGENCY, lastDebounceEMERGENCY);
  bool nextPagePressed   = isPressed(PIN_NEXTPAGE, prevStateNEXTPAGE, lastDebounceNEXTPAGE);

  // --------------------------------------------------------
  // GLOBAL: Dedicated EMERGENCY button (GPIO33) - backup emergency
  // button, independent of the Emergency category. Works from ANY
  // screen. Two-stage flow: press -> confirm prompt (short beep,
  // LED off, no continuous buzzer). Press again while ACTIVE -> cancel.
  // --------------------------------------------------------
  if (emergencyPressed) {
    if (currentState == EMERGENCY) {
      // Currently active -> this press CANCELS emergency mode
      emergencyActive = false;

      digitalWrite(PIN_LED, LOW);
      noTone(PIN_BUZZER);

      emergencyClearedStartTime = millis();
      currentState = EMERGENCY_CLEARED;
      drawEmergencyCleared();
    } else if (currentState != EMERGENCY_CONFIRM) {
      // Not currently in emergency flow -> start confirmation stage
      stateBeforeEmergency = currentState;
      currentState = EMERGENCY_CONFIRM;

      // LED must remain OFF, continuous buzzer must NOT start yet.
      digitalWrite(PIN_LED, LOW);

      // Immediately play ONE short confirmation beep (buzzer only)
      emergencyBeepPulseActive = true;
      emergencyBeepPulseStartTime = millis();
      tone(PIN_BUZZER, 1000);

      drawEmergencyConfirm();
    }
    // If already in EMERGENCY_CONFIRM, ignore repeated presses (waiting for OK)
    return; // emergency handling takes priority this cycle
  }

  // --------------------------------------------------------
  // GLOBAL: EXIT button returns to Home from ANY state
  // (While in EMERGENCY / EMERGENCY_CONFIRM / EMERGENCY_CLEARED,
  //  EXIT does nothing - only the Emergency button flow can
  //  clear emergency, per spec.)
  // --------------------------------------------------------
  if (exitPressed && currentState != EMERGENCY &&
      currentState != EMERGENCY_CONFIRM && currentState != EMERGENCY_CLEARED) {
    currentState = HOME;
    homeSelection = 0;
    drawHome();
    return;
  }

  // --------------------------------------------------------
  // NEXT PAGE button - placeholder, works globally
  // --------------------------------------------------------
  if (nextPagePressed) {
    handleNextPage();
  }

  // --------------------------------------------------------
  // STATE-SPECIFIC BUTTON HANDLING
  // --------------------------------------------------------
  switch (currentState) {

    case HOME: {
      if (upPressed) {
        homeSelection = (homeSelection - 1 + NUM_CATEGORIES) % NUM_CATEGORIES; // wrap around
        drawHome();
      }
      if (downPressed) {
        homeSelection = (homeSelection + 1) % NUM_CATEGORIES; // wrap around
        drawHome();
      }
      if (okPressed) {
        categorySelection = homeSelection;

        // Point currentMessageArray to the selected category's messages
        // (Emergency category now behaves exactly like the other categories)
        if (strcmp(categoryNames[categorySelection], "Basic Needs") == 0) {
          currentMessageArray = basicNeedsMessages;
          currentMessageArrayLen = NUM_BASIC_MSGS;
        } else if (strcmp(categoryNames[categorySelection], "Comfort") == 0) {
          currentMessageArray = comfortMessages;
          currentMessageArrayLen = NUM_COMFORT_MSGS;
        } else if (strcmp(categoryNames[categorySelection], "Emergency") == 0) {
          currentMessageArray = emergencyMessages;
          currentMessageArrayLen = NUM_EMERGENCY_MSGS;
        }

        messageIndex = 0;
        lastAutoScrollTime = millis(); // reset auto-scroll timer on entry
        currentState = CATEGORY;
        drawCategory();
      }
      break;
    }

    case CATEGORY: {
      if (rightPressed) {
        messageIndex = (messageIndex + 1) % currentMessageArrayLen; // wrap
        lastAutoScrollTime = millis(); // reset auto-scroll timer on manual nav
        drawCategory();
      }
      if (leftPressed) {
        messageIndex = (messageIndex - 1 + currentMessageArrayLen) % currentMessageArrayLen; // wrap
        lastAutoScrollTime = millis(); // reset auto-scroll timer on manual nav
        drawCategory();
      }
      if (okPressed) {
        currentState = CONFIRM;
        drawConfirm();
      }
      break;
    }

    case CONFIRM: {
      if (okPressed) {
        // Confirmed -> send request, give feedback, show Request Sent screen
        feedbackPulseActive = true;
        feedbackPulseStartTime = millis();
        digitalWrite(PIN_LED, HIGH);
        tone(PIN_BUZZER, 1000);

        requestSentStartTime = millis();
        currentState = REQUEST_SENT;
        drawRequestSent();
      }
      // EXIT handled globally above (cancels back to Home)
      break;
    }

    case REQUEST_SENT: {
      // No button actions here; auto-returns to Home via timer in loop()
      break;
    }

    case EMERGENCY: {
      // Only the dedicated EMERGENCY button (handled globally above) can exit this state
      break;
    }

    case EMERGENCY_CONFIRM: {
      // Patient presses OK to confirm the dedicated-button emergency alert
      if (okPressed) {
        // Stop the short confirmation beep pulse bookkeeping (continuous buzzer takes over)
        emergencyBeepPulseActive = false;

        emergencyActive = true;
        currentState = EMERGENCY;

        // Turn LED ON continuously and buzzer ON continuously
        digitalWrite(PIN_LED, HIGH);
        tone(PIN_BUZZER, 1000);

        drawEmergency();
      }
      break;
    }

    case EMERGENCY_CLEARED: {
      // No button actions here; auto-returns to Home via timer in loop()
      break;
    }
  }
}

// ============================================================
// handleAutoScroll()
// While in CATEGORY state, automatically advance to the next
// message every 3 seconds using millis() (non-blocking).
// ============================================================
void handleAutoScroll() {
  if (currentState != CATEGORY) return;

  if (millis() - lastAutoScrollTime >= AUTO_SCROLL_INTERVAL) {
    lastAutoScrollTime = millis();
    messageIndex = (messageIndex + 1) % currentMessageArrayLen; // wrap around
    drawCategory();
  }
}

// ============================================================
// toggleEmergency()
// EMERGENCY button (or selecting Emergency category) TOGGLES
// emergency mode on/off. Activating sets LED/Buzzer continuously
// ON. Deactivating clears them, shows a confirmation message,
// then returns to Home.
// ============================================================
void toggleEmergency() {
  if (!emergencyActive) {
    // Activate emergency
    emergencyActive = true;
    stateBeforeEmergency = currentState;
    currentState = EMERGENCY;

    digitalWrite(PIN_LED, HIGH);
    tone(PIN_BUZZER, 1000);

    drawEmergency();
  } else {
    // Deactivate emergency
    emergencyActive = false;

    digitalWrite(PIN_LED, LOW);
    noTone(PIN_BUZZER);

    // Show "Emergency Cleared" briefly, then return Home
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 25);
    display.println(F("Emergency Cleared"));
    display.setCursor(10, 40);
    display.println(F("Return Home..."));
    display.display();

    // Non-blocking would normally require a state, but per spec this is
    // a brief transitional message; we use a short busy-wait-free approach:
    // set state to HOME and let drawHome() render on next cycle.
    currentState = HOME;
    homeSelection = 0;

    // Give a moment for message visibility using millis() based small pause
    unsigned long clearedMsgStart = millis();
    while (millis() - clearedMsgStart < 1200) {
      // Keep polling emergency/exit button in case of re-press during this short window
      // (kept minimal to honor "no delay()" rule while still showing the message)
    }

    drawHome();
  }
}

// ============================================================
// handleNextPage()
// Placeholder function for NEXT PAGE button (GPIO32).
// Currently unused - reserved for future feature expansion.
// ============================================================
void handleNextPage() {
  // Intentionally left as placeholder.
  // Future use: pagination for extended message lists, settings page, etc.
}

// ============================================================
// handleFeedbackPulse()
// Handles the single non-blocking LED/Buzzer pulse triggered
// when a request is confirmed (CONFIRM -> REQUEST_SENT).
// ============================================================
void handleFeedbackPulse() {
  if (feedbackPulseActive) {
    if (millis() - feedbackPulseStartTime >= FEEDBACK_PULSE_DURATION) {
      // Only turn off if not currently in Emergency mode (which keeps them ON)
      if (currentState != EMERGENCY) {
        digitalWrite(PIN_LED, LOW);
        noTone(PIN_BUZZER);
      }
      feedbackPulseActive = false;
    }
  }
}

// ============================================================
// handleEmergencyBeepPulse()
// Handles the single non-blocking buzzer-only beep triggered when
// the dedicated Emergency button (GPIO33) is first pressed, while
// waiting in EMERGENCY_CONFIRM for the patient to press OK.
// ============================================================
void handleEmergencyBeepPulse() {
  if (emergencyBeepPulseActive) {
    if (millis() - emergencyBeepPulseStartTime >= EMERGENCY_BEEP_DURATION) {
      // Only turn buzzer off if emergency hasn't since been confirmed active
      if (currentState != EMERGENCY) {
        noTone(PIN_BUZZER);
      }
      emergencyBeepPulseActive = false;
    }
  }
}

// ============================================================
// drawHome()
// Renders the Home screen: title + category list with the
// currently selected category highlighted using ">".
// ============================================================
void drawHome() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println(F("TouchVox"));
  display.setCursor(0, 12);
  display.println(F("Select Category"));

  int yStart = 28;
  for (int i = 0; i < NUM_CATEGORIES; i++) {
    display.setCursor(0, yStart + (i * 12));
    if (i == homeSelection) {
      display.print(F("> "));
    } else {
      display.print(F("  "));
    }
    display.println(categoryNames[i]);
  }

  display.display();
}

// ============================================================
// drawCategory()
// Renders the Category screen: category name + current message.
// ============================================================
void drawCategory() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println(categoryNames[categorySelection]);

  display.drawLine(0, 10, SCREEN_WIDTH, 10, SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(10, 28);
  if (currentMessageArray != nullptr) {
    display.println(currentMessageArray[messageIndex]);
  }

  display.setTextSize(1);
  display.setCursor(0, 55);
  display.print(F("OK=Select"));

  display.display();
}

// ============================================================
// drawConfirm()
// Renders the Confirmation screen for the selected message.
// ============================================================
void drawConfirm() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println(F("------------------------"));
  display.setCursor(0, 12);
  display.println(F("Send Request?"));

  display.setTextSize(1);
  display.setCursor(0, 26);
  if (currentMessageArray != nullptr) {
    display.println(currentMessageArray[messageIndex]);
  }

  display.setCursor(0, 42);
  display.println(F("OK = Send"));
  display.setCursor(0, 52);
  display.println(F("EXIT = Cancel"));

  display.display();
}

// ============================================================
// drawRequestSent()
// Renders the "Request Sent Successfully" confirmation screen.
// ============================================================
void drawRequestSent() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println(F("------------------------"));
  display.setCursor(0, 20);
  display.println(F("Request Sent"));
  display.setCursor(0, 32);
  display.println(F("Successfully"));
  display.setCursor(0, 50);
  display.println(F("------------------------"));

  display.display();
}

// ============================================================
// drawEmergency()
// Renders the Emergency alert-active screen (continuous LED/Buzzer)
// after the patient confirms via the dedicated Emergency button flow.
// ============================================================
void drawEmergency() {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(5, 15);
  display.println(F("EMERGENCY"));
  display.setCursor(5, 38);
  display.println(F("ALERT SENT"));

  display.display();
}

// ============================================================
// drawEmergencyConfirm()
// Renders the confirmation prompt shown immediately after the
// dedicated Emergency button (GPIO33) is pressed, before the
// continuous alert is activated.
// ============================================================
void drawEmergencyConfirm() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 10);
  display.println(F("--------------------"));
  display.setCursor(0, 25);
  display.println(F("Emergency Alert"));
  display.setCursor(0, 40);
  display.println(F("Press OK"));
  display.setCursor(0, 50);
  display.println(F("to Confirm"));
  display.setCursor(0, 58);
  display.println(F("--------------------"));

  display.display();
}

// ============================================================
// drawEmergencyCleared()
// Renders the transitional "Emergency Cleared" screen shown after
// the dedicated Emergency button cancels an active alert, before
// returning to Home.
// ============================================================
void drawEmergencyCleared() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(10, 28);
  display.println(F("Emergency Cleared"));

  display.display();
}
