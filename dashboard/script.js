const requestContainer = document.getElementById("requestContainer");
const emergencyContainer = document.getElementById("emergencyContainer");

// ==============================
// Render Server URL
// ==============================
const SERVER_URL = "https://touchvox-scheme4.onrender.com";

let requests = [];

/* -----------------------------
   Fetch Requests from Server
------------------------------*/

async function loadRequests() {

    try {

        const response = await fetch(`${SERVER_URL}/requests`);

        requests = await response.json();

        render();

    } catch (err) {

        console.log("Server Error:", err);

    }

}


/* -----------------------------
   Render Dashboard
------------------------------*/

function render() {

    requestContainer.innerHTML = "";
    emergencyContainer.innerHTML = "";

    let normalFound = false;
    let emergencyFound = false;

    requests.forEach(req => {

        if (req.type === "EMERGENCY") {

            emergencyFound = true;

            emergencyContainer.innerHTML += `

            <div class="emergency-card">

                <div class="emergency-title">
                    🚨 EMERGENCY ALERT
                </div>

                <p><b>Room :</b> ${req.room}</p>

                <p><b>Patient :</b> ${req.patient}</p>

                <p><b>Immediate Assistance Required</b></p>

                <p>${req.time}</p>

                <button
                class="emergency-btn"
                onclick="acknowledge(${req.id})">

                ACKNOWLEDGE

                </button>

            </div>

            `;

        }

        else {

            normalFound = true;

            requestContainer.innerHTML += `

            <div class="request-card">

                <div class="request-title">

                ${req.message}

                </div>

                <p><b>Room :</b> ${req.room}</p>

                <p><b>Patient :</b> ${req.patient}</p>

                <p>${req.time}</p>

                <button
                class="request-btn"
                onclick="acknowledge(${req.id})">

                ACKNOWLEDGE

                </button>

            </div>

            `;

        }

    });

    if (!normalFound) {

        requestContainer.innerHTML =

        `<div class="empty-card">

        No Pending Requests

        </div>`;

    }

    if (!emergencyFound) {

        emergencyContainer.innerHTML =

        `<div class="empty-card">

        No Emergency Alerts

        </div>`;

    }

}


/* -----------------------------
   Acknowledge
------------------------------*/

async function acknowledge(id) {

    await fetch(`${SERVER_URL}/request/${id}`, {

        method: "DELETE"

    });

    loadRequests();

}


/* -----------------------------
   Refresh every second
------------------------------*/

setInterval(loadRequests,1000);

loadRequests();
