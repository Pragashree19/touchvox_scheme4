/* ==========================================================
   TouchVox Nurse Dashboard
   Temporary Simulation Version
   Later this data will come from the ESP32 through Node.js.
========================================================== */

let emergencyAlerts = [];

let requests = [

{
    id:1,
    room:"101",
    patient:"Test Patient",
    message:"💧 Water",
    time:"10:15 AM"
},

{
    id:2,
    room:"101",
    patient:"Test Patient",
    message:"🛏 Blanket",
    time:"10:17 AM"
},

{
    id:3,
    room:"101",
    patient:"Test Patient",
    message:"🤧 Cough",
    time:"10:19 AM"
}

];

const requestContainer=document.getElementById("requestContainer");

const emergencyContainer=document.getElementById("emergencyContainer");


/* -----------------------------
   Render Normal Requests
------------------------------*/

function renderRequests(){

    if(requests.length==0){

        requestContainer.innerHTML=`
        <div class="empty-card">
        No Pending Requests
        </div>
        `;

        return;

    }

    requestContainer.innerHTML="";

    requests.forEach(req=>{

        requestContainer.innerHTML+=`

        <div class="request-card">

            <div class="request-title">

                ${req.message}

            </div>

            <p class="room">

                Room : ${req.room}

            </p>

            <p class="patient">

                Patient : ${req.patient}

            </p>

            <p class="time">

                ${req.time}

            </p>

            <button
                class="request-btn"
                onclick="ackRequest(${req.id})">

                ACKNOWLEDGE

            </button>

        </div>

        `;

    });

}


/* -----------------------------
   Render Emergency Alerts
------------------------------*/

function renderEmergency(){

    if(emergencyAlerts.length==0){

        emergencyContainer.innerHTML=`

        <div class="empty-card">

            No Emergency Alerts

        </div>

        `;

        return;

    }

    emergencyContainer.innerHTML="";

    emergencyAlerts.forEach(alert=>{

        emergencyContainer.innerHTML+=`

        <div class="emergency-card">

            <div class="emergency-title">

                🚨 EMERGENCY ALERT

            </div>

            <p class="room">

                Room : ${alert.room}

            </p>

            <p class="patient">

                Patient : ${alert.patient}

            </p>

            <p>

                Immediate Assistance Required

            </p>

            <p class="time">

                ${alert.time}

            </p>

            <button

                class="emergency-btn"

                onclick="ackEmergency(${alert.id})">

                ACKNOWLEDGE

            </button>

        </div>

        `;

    });

}


/* -----------------------------
   Acknowledge Request
------------------------------*/

function ackRequest(id){

    requests=requests.filter(r=>r.id!=id);

    renderRequests();

}


/* -----------------------------
   Acknowledge Emergency
------------------------------*/

function ackEmergency(id){

    emergencyAlerts=
    emergencyAlerts.filter(e=>e.id!=id);

    renderEmergency();

}


/* ==========================================================
   TEMPORARY TEST DATA
========================================================== */

/* Uncomment this block to test emergency card

setTimeout(()=>{

emergencyAlerts.push({

id:101,

room:"101",

patient:"Test Patient",

time:"10:25 AM"

});

renderEmergency();

},5000);

*/


renderRequests();

renderEmergency();
