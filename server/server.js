const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Pending requests
let requests = [];

/* -----------------------------
   Patient sends a request
----------------------------- */

app.post("/request", (req, res) => {

    const data = req.body;

    data.id = Date.now();

    data.time = new Date().toLocaleTimeString();

    requests.push(data);

    console.log("New Request:", data);

    res.json({
        status: "success"
    });

});


/* -----------------------------
   Dashboard fetches requests
----------------------------- */

app.get("/requests", (req, res) => {

    res.json(requests);

});


/* -----------------------------
   Nurse acknowledges request
----------------------------- */

app.delete("/request/:id", (req, res) => {

    const id = Number(req.params.id);

    requests = requests.filter(r => r.id !== id);

    res.json({
        status: "removed"
    });

});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log("TouchVox Server Running");
    console.log("http://localhost:3000");

});
