// ParcelCare JavaScript

function searchParcel() {

    const parcelId = document
        .getElementById("parcelSearch")
        .value
        .trim()
        .toUpperCase();

    if (parcelId === "") {
    document.getElementById("tracking").style.display = "none";
    alert("Please enter a Parcel ID.");
    return;
}

    const parcels = {
        PC10234: {
            status: "OUT FOR DELIVERY",
            location: "Madurai Delivery Hub",
            delivery: "Today, 4:00 PM – 6:00 PM",
            type: "Standard Delivery"
        },

        PC10567: {
            status: "DELIVERED",
            location: "Madurai",
            delivery: "Delivered on Sep 27, 2026",
            type: "Standard Delivery"
        },

        PC10891: {
            status: "DELIVERY DELAYED",
            location: "Chennai Sorting Hub",
            delivery: "Expected Sep 29, 2026",
            type: "Standard Delivery"
        },

        PC11245: {
            status: "PARCEL DAMAGED",
            location: "Madurai Delivery Hub",
            delivery: "Delivery on hold",
            type: "Express Delivery"
        },

        PC11678: {
            status: "CANCELLATION / REFUND",
            location: "Return Processing Centre",
            delivery: "Refund under processing",
            type: "Express Delivery"
        }
    };

    const parcel = parcels[parcelId];

    if (!parcel) {
    document.getElementById("tracking").style.display = "none";
    alert("Parcel not found. Please check the Parcel ID.");
    return;
}

    document.getElementById("activeParcelId").textContent =
        "Parcel " + parcelId;

    document.getElementById("parcelStatus").textContent =
        parcel.status;
        const statusElement = document.getElementById("parcelStatus");

statusElement.className = "status";

if (parcelId === "PC10234") {
    statusElement.classList.add("status-delivery");
}
else if (parcelId === "PC10567") {
    statusElement.classList.add("status-delivered");
}
else if (parcelId === "PC10891") {
    statusElement.classList.add("status-delayed");
}
else if (parcelId === "PC11245") {
    statusElement.classList.add("status-damaged");
}
else if (parcelId === "PC11678") {
    statusElement.classList.add("status-refund");
}

    document.getElementById("parcelLocation").textContent =
        parcel.location;

    document.getElementById("parcelDelivery").textContent =
        parcel.delivery;

    document.getElementById("parcelType").textContent =
        parcel.type;
        updateDeliveryHistory(parcelId);
updateProgressBar(parcelId);

document.getElementById("tracking").style.display = "block";

document.getElementById("tracking").scrollIntoView({
    behavior: "smooth"
});
}


function openReschedule() {
    document.getElementById("rescheduleModal").classList.add("show");
}


function closeReschedule() {
    document.getElementById("rescheduleModal").classList.remove("show");
}


function selectSlot(slot) {

    document.querySelectorAll(".slot").forEach(function(item) {
        item.classList.remove("selected");
    });

    slot.classList.add("selected");
}


function confirmReschedule() {

    const selectedSlot = document.querySelector(".slot.selected");

    if (!selectedSlot) {
        alert("Please select a delivery slot.");
        return;
    }

    alert("Delivery rescheduled successfully!");

    closeReschedule();
}


let selectedIssue = "";


function openIssue() {
    document.getElementById("issueModal").classList.add("show");
}


function closeIssue() {
    document.getElementById("issueModal").classList.remove("show");
    selectedIssue = "";

    document.querySelectorAll(".issue-option").forEach(function(item) {
        item.classList.remove("selected");
    });
}


function selectIssue(option, issue) {

    document.querySelectorAll(".issue-option").forEach(function(item) {
        item.classList.remove("selected");
    });

    option.classList.add("selected");

    selectedIssue = issue;
}


function submitIssue() {

    if (selectedIssue === "") {
        alert("Please select an issue first.");
        return;
    }

    alert(
        "Issue submitted successfully!\n\n" +
        "Issue: " + selectedIssue +
        "\nParcel: PC10234" +
        "\nStatus: Resolution requested"
    );

    closeIssue();
}


function openDamage() {
    document.getElementById("damageModal").classList.add("show");
}


function closeDamage() {
    document.getElementById("damageModal").classList.remove("show");
}


function submitDamage() {

    const damageType = document.getElementById("damageType").value;
    const description = document.getElementById("damageDescription").value;
    const proof = document.getElementById("damageProof").files[0];

    if (damageType === "") {
        alert("Please select the damage type.");
        return;
    }

    if (description.trim() === "") {
        alert("Please describe the damage.");
        return;
    }

    if (!proof) {
        alert("Please upload a photo as proof.");
        return;
    }

    alert(
        "Damage report submitted successfully!\n\n" +
        "Parcel: PC10234\n" +
        "Damage: " + damageType + "\n" +
        "Proof: " + proof.name + "\n\n" +
        "Our team will review your request."
    );

    closeDamage();
}


function verifyDelivery() {
    document.getElementById("verificationModal").classList.add("show");
}


function closeVerification() {
    document.getElementById("verificationModal").classList.remove("show");
}


function reportNotReceived() {

    alert(
        "Delivery dispute created successfully!\n\n" +
        "Parcel: PC10234\n" +
        "Issue: Parcel not received\n" +
        "Status: Verification in progress"
    );

    closeVerification();
}
let selectedSafePlace = "";


function openSafeDelivery() {
    document.getElementById("safeDeliveryModal").classList.add("show");
}


function closeSafeDelivery() {
    document.getElementById("safeDeliveryModal").classList.remove("show");
}


function selectSafePlace(option, place) {

    document.querySelectorAll(".safe-option").forEach(function(item) {
        item.classList.remove("selected");
    });

    option.classList.add("selected");

    selectedSafePlace = place;
}


function saveSafePlace() {

    if (selectedSafePlace === "") {
        alert("Please select a delivery preference.");
        return;
    }

    localStorage.setItem("safeDeliveryPreference", selectedSafePlace);

    alert(
        "Safe delivery preference saved!\n\n" +
        "Preference: " + selectedSafePlace
    );

    closeSafeDelivery();
}
function confirmAvailability() {

    alert(
        "Availability confirmed! ✓\n\n" +
        "Your parcel PC10234 will be delivered today."
    );
}
function openRefund() {
    document.getElementById("refundModal").classList.add("show");
}

function closeRefund() {
    document.getElementById("refundModal").classList.remove("show");
}

function requestCancellation() {
    const confirmCancel = confirm(
        "Are you sure you want to cancel Parcel PC10234?"
    );

    if (confirmCancel) {
        alert(
            "Cancellation request submitted successfully!\n\n" +
            "Parcel: PC10234\n" +
            "Status: Cancellation requested\n" +
            "Refund: Processing"
        );

        closeRefund();
    }
}
function updateDashboard() {

    document.getElementById("totalParcels").textContent = "3";

    document.getElementById("outForDelivery").textContent = "1";

    document.getElementById("actionRequired").textContent = "1";

    document.getElementById("refundPending").textContent = "1";
}

updateDashboard();
function viewParcel(parcelId) {

    if (parcelId === "PC10234") {

        alert(
            "Parcel Details\n\n" +
            "Parcel ID: PC10234\n" +
            "Item: Electronics\n" +
            "Status: Out for Delivery\n" +
            "Location: Madurai Delivery Hub\n" +
            "Expected: Today, 4:00 PM – 6:00 PM"
        );

    } else if (parcelId === "PC10567") {

        alert(
            "Parcel Details\n\n" +
            "Parcel ID: PC10567\n" +
            "Item: Books\n" +
            "Status: Delivered\n" +
            "Delivery: Successfully completed"
        );

    } else if (parcelId === "PC10891") {

        alert(
            "Parcel Details\n\n" +
            "Parcel ID: PC10891\n" +
            "Item: Clothing\n" +
            "Status: Action Required\n" +
            "Please check the Issue Resolution Center."
        );
    }
}
function setupSettings() {

    const switches = document.querySelectorAll(".switch input");

    switches.forEach(function(switchItem) {

        switchItem.addEventListener("change", function() {

            if (this.checked) {
                alert("Setting enabled ✓");
            } else {
                alert("Setting disabled");
            }

        });

    });
}

setupSettings();
function getHelp(problem) {

    const result = document.getElementById("helpResult");

    if (problem === "late") {

        result.innerHTML =
            "💡 <strong>Recommended Action:</strong> " +
            "Report a delivery delay through the Issue Resolution Center.";

    }

    else if (problem === "missing") {

        result.innerHTML =
            "💡 <strong>Recommended Action:</strong> " +
            "Use Delivery Verification to report that the parcel was not received.";

    }

    else if (problem === "damaged") {

        result.innerHTML =
            "💡 <strong>Recommended Action:</strong> " +
            "Submit a damage report with a photo as proof.";

    }

    else if (problem === "unavailable") {

        result.innerHTML =
            "💡 <strong>Recommended Action:</strong> " +
            "Reschedule the delivery or select a Safe Delivery preference.";

    }
}
function contactSupport() {

    alert(
        "Customer Support\n\n" +
        "Your support request has been created.\n\n" +
        "Reference ID: PC-HELP-10234\n" +
        "Our team will review your request."
    );
}

function viewHelp() {

    alert(
        "ParcelCare Help Guide\n\n" +
        "• Use Tracking to check parcel status.\n" +
        "• Use Reschedule if you are unavailable.\n" +
        "• Use Report Damage to submit damage proof.\n" +
        "• Use Delivery Verification if your parcel was not received.\n" +
        "• Use Cancellation & Refund for cancellation requests."
    );
}
function updateDeliveryHistory(parcelId) {

    const history = document.getElementById("deliveryHistory");

    if (parcelId === "PC10234") {

        history.innerHTML = `
            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Ordered</strong>
                    <p>Parcel order was successfully created.</p>
                    <small>Sep 25, 10:30 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Shipped</strong>
                    <p>Parcel left the sender's location.</p>
                    <small>Sep 26, 08:15 AM</small>
                </div>
            </div>

            <div class="history-item active">
                <div class="history-icon">🚚</div>
                <div>
                    <strong>Out for Delivery</strong>
                    <p>Parcel is currently at Madurai Delivery Hub.</p>
                    <small>Today, 09:00 AM</small>
                </div>
            </div>

            <div class="history-item">
                <div class="history-icon">🏠</div>
                <div>
                    <strong>Delivered</strong>
                    <p>Waiting for successful delivery.</p>
                    <small>Expected Today, 4:00 PM – 6:00 PM</small>
                </div>
            </div>
        `;

    } else if (parcelId === "PC10567") {

        history.innerHTML = `
            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Ordered</strong>
                    <p>Parcel order was successfully created.</p>
                    <small>Sep 24, 10:30 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Shipped</strong>
                    <p>Parcel left the sender's location.</p>
                    <small>Sep 25, 08:15 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Out for Delivery</strong>
                    <p>Parcel was sent for final delivery.</p>
                    <small>Sep 27, 09:00 AM</small>
                </div>
            </div>

            <div class="history-item active">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Delivered</strong>
                    <p>Parcel was successfully delivered.</p>
                    <small>Sep 27, 02:30 PM</small>
                </div>
            </div>
        `;

    } else if (parcelId === "PC10891") {

        history.innerHTML = `
            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Ordered</strong>
                    <p>Parcel order was successfully created.</p>
                    <small>Sep 25, 11:00 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Shipped</strong>
                    <p>Parcel left the sender's location.</p>
                    <small>Sep 26, 09:00 AM</small>
                </div>
            </div>

            <div class="history-item active">
                <div class="history-icon">⚠️</div>
                <div>
                    <strong>Delivery Delayed</strong>
                    <p>Delivery has been delayed at the sorting hub.</p>
                    <small>Today, 11:30 AM</small>
                </div>
            </div>

            <div class="history-item">
                <div class="history-icon">🚚</div>
                <div>
                    <strong>Delivery Pending</strong>
                    <p>A new delivery attempt will be scheduled.</p>
                    <small>Action required</small>
                </div>
            </div>
        `;

    } else if (parcelId === "PC11245") {

        history.innerHTML = `
            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Ordered</strong>
                    <p>Parcel order was successfully created.</p>
                    <small>Sep 24, 09:30 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Shipped</strong>
                    <p>Parcel left the sender's location.</p>
                    <small>Sep 25, 07:45 AM</small>
                </div>
            </div>

            <div class="history-item active">
                <div class="history-icon">📦</div>
                <div>
                    <strong>Parcel Damaged</strong>
                    <p>Damage was identified during delivery handling.</p>
                    <small>Today, 10:15 AM</small>
                </div>
            </div>

            <div class="history-item">
                <div class="history-icon">🛠️</div>
                <div>
                    <strong>Resolution Required</strong>
                    <p>Submit a damage report for further resolution.</p>
                    <small>Action required</small>
                </div>
            </div>
        `;

    } else if (parcelId === "PC11678") {

        history.innerHTML = `
            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Ordered</strong>
                    <p>Parcel order was successfully created.</p>
                    <small>Sep 23, 10:00 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Parcel Shipped</strong>
                    <p>Parcel left the sender's location.</p>
                    <small>Sep 24, 08:30 AM</small>
                </div>
            </div>

            <div class="history-item completed">
                <div class="history-icon">✓</div>
                <div>
                    <strong>Cancellation Requested</strong>
                    <p>Cancellation request was submitted.</p>
                    <small>Sep 26, 03:00 PM</small>
                </div>
            </div>

            <div class="history-item active">
                <div class="history-icon">💰</div>
                <div>
                    <strong>Refund Processing</strong>
                    <p>Refund is currently being processed.</p>
                    <small>Expected within 3–5 working days</small>
                </div>
            </div>
        `;
    }
}
function updateProgressBar(parcelId) {

    const ordered = document.getElementById("stepOrdered");
    const shipped = document.getElementById("stepShipped");
    const delivery = document.getElementById("stepDelivery");
    const delivered = document.getElementById("stepDelivered");

    const line = document.getElementById("progressLine");

    // Reset all steps
    [ordered, shipped, delivery, delivered].forEach(function(step) {
        step.classList.remove("completed", "active");
    });

    // Default completed stages
    ordered.classList.add("completed");
    shipped.classList.add("completed");

    if (parcelId === "PC10234") {

        delivery.classList.add("active");

    } else if (parcelId === "PC10567") {

        delivery.classList.add("completed");
        delivered.classList.add("completed");

    } else if (parcelId === "PC10891") {

        delivery.classList.add("active");

    } else if (parcelId === "PC11245") {

        delivery.classList.add("active");

    } else if (parcelId === "PC11678") {

        delivery.classList.add("completed");
        delivered.classList.add("active");
    }
    const deliveryIcon = document.getElementById("deliveryStepIcon");
const deliveryText = document.getElementById("deliveryStepText");

if (parcelId === "PC10234") {
    deliveryIcon.textContent = "🚚";
    deliveryText.textContent = "Out for Delivery";
}
else if (parcelId === "PC10567") {
    deliveryIcon.textContent = "✓";
    deliveryText.textContent = "Delivered";
}
else if (parcelId === "PC10891") {
    deliveryIcon.textContent = "⚠️";
    deliveryText.textContent = "Delayed";
}
else if (parcelId === "PC11245") {
    deliveryIcon.textContent = "📦";
    deliveryText.textContent = "Damaged";
}
else if (parcelId === "PC11678") {
    deliveryIcon.textContent = "✓";
    deliveryText.textContent = "Cancelled";
}

    updateProgressLine(parcelId);
}
function updateProgressLine(parcelId) {

    const line = document.getElementById("progressLine");

    if (parcelId === "PC10234") {

        line.style.background =
            "linear-gradient(to right, #4f46e5 0%, #4f46e5 66%, #e5e7eb 66%, #e5e7eb 100%)";

    } else if (parcelId === "PC10567") {

        line.style.background =
            "linear-gradient(to right, #4f46e5 0%, #4f46e5 100%)";

    } else if (parcelId === "PC10891") {

        line.style.background =
            "linear-gradient(to right, #4f46e5 0%, #4f46e5 50%, #e5e7eb 50%, #e5e7eb 100%)";

    } else if (parcelId === "PC11245") {

        line.style.background =
            "linear-gradient(to right, #4f46e5 0%, #4f46e5 50%, #e5e7eb 50%, #e5e7eb 100%)";

    } else if (parcelId === "PC11678") {

        line.style.background =
            "linear-gradient(to right, #4f46e5 0%, #4f46e5 100%)";
    }
}