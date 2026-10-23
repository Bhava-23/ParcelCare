// ParcelCare JavaScript (version 3)
// -----------------------------------------------------------------------------
// Everything is saved in the browser's localStorage. That makes this a DEMO:
//   * data stays only in this browser (it is not a shared database),
//   * the login is a demonstration, not secure production authentication,
//   * parcel locations/statuses are typed in by hand (no GPS, no courier API).
//
// Sections:
//   0. Helpers            1. Storage and data model     2. Login / registration
//   3. Parcels + tracking 4. Actions (reschedule, issue, damage, verify, safe, refund)
//   5. Delivery Confidence + Eco   6. Assistant, support, settings, profile
//   7. Interactions       8. Start-up
// -----------------------------------------------------------------------------


/* =========================================================
   0. HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pad(n) {
    return String(n).padStart(2, "0");
}

function toISODate(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function todayISO() {
    return toISODate(new Date());
}

function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return toISODate(d);
}

function isValidDate(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso || "") && !isNaN(new Date(iso + "T00:00:00"));
}

function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return "-";
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "-";
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtHour(h) {
    const x = ((h % 24) + 24) % 24;
    return (x % 12 || 12) + ":00 " + (x < 12 ? "AM" : "PM");
}

function makeId(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function money(n) {
    return "₹" + Number(n).toLocaleString("en-IN");
}

// Counts a number up (or down) smoothly
function animateNumber(el, to, ms) {

    const from = parseInt(el.textContent, 10) || 0;

    if (reduceMotion || from === to) {
        el.textContent = to;
        return;
    }

    const duration = ms || 700;
    const start = performance.now();

    function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

// Toast notification. type: "success" | "error" | "warning" | "info"
function notify(title, body, type, duration) {

    let box = $("toastBox");

    if (!box) {
        box = document.createElement("div");
        box.id = "toastBox";
        box.setAttribute("aria-live", "polite");
        document.body.appendChild(box);
    }

    const icons = { success: "✓", error: "✕", warning: "!", info: "i" };
    const kind = type || "info";

    const toast = document.createElement("div");
    toast.className = "toast " + kind;

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = icons[kind];

    const text = document.createElement("div");
    text.className = "toast-text";

    const heading = document.createElement("strong");
    heading.textContent = title;
    text.appendChild(heading);

    if (body) {
        const p = document.createElement("p");
        p.textContent = body;
        text.appendChild(p);
    }

    const close = document.createElement("button");
    close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(close);
    box.appendChild(toast);

    function remove() {
        toast.classList.add("leaving");
        setTimeout(function() { toast.remove(); }, 300);
    }

    close.addEventListener("click", remove);
    setTimeout(remove, duration || 4500);
}

// Shows a list of problems inside a form
function showErrors(el, list) {

    if (!list || list.length === 0) {
        el.hidden = true;
        el.innerHTML = "";
        return;
    }

    el.innerHTML = "<ul>" + list.map(function(item) {
        return "<li>" + esc(item) + "</li>";
    }).join("") + "</ul>";

    el.hidden = false;
}

// Puts a spinner on a button while something is happening
function setBusy(button, busy) {

    if (!button) return;

    button.classList.toggle("btn-loading", busy);
    button.disabled = busy;
}


/* =========================================================
   MODALS (open / close with focus handling)
   ========================================================= */

let lastFocus = null;

function openModal(id) {

    const modal = $(id);

    lastFocus = document.activeElement;
    modal.classList.add("show");

    const first = modal.querySelector(
        "input:not([type=hidden]):not([readonly]), select, textarea, .confirm-btn"
    );

    if (first) {
        setTimeout(function() { first.focus(); }, 60);
    }
}

function closeModal(id) {

    $(id).classList.remove("show");

    if (lastFocus && typeof lastFocus.focus === "function" && document.body.contains(lastFocus)) {
        lastFocus.focus();
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal.show").forEach(function(modal) {
        modal.classList.remove("show");
    });
}


/* =========================================================
   1. STORAGE AND DATA MODEL
   ========================================================= */

const KEYS = {
    users:   "pc_users_v3",
    session: "pc_session_v3",
    parcels: "pc_parcels_v3",
    prefs:   "pc_prefs_v3",
    support: "pc_support_v3"
};

// The login session lives in sessionStorage: closing the tab or browser logs you out,
// and opening the site again asks for a login. (Refreshing the page keeps you logged in.)
function readSession() {

    try {
        const raw = sessionStorage.getItem(KEYS.session);
        const v = raw ? JSON.parse(raw) : null;
        return isPlainObject(v) && typeof v.username === "string" ? v : null;
    } catch (e) {
        return null;
    }
}

function writeSession(username) {
    try {
        sessionStorage.setItem(KEYS.session, JSON.stringify({ username: username, at: Date.now() }));
    } catch (e) { /* ignore */ }
}

function clearSession() {
    try {
        sessionStorage.removeItem(KEYS.session);
    } catch (e) { /* ignore */ }
}

const db = { users: {}, parcels: [], prefs: {}, support: [] };

let corruptedKeys = [];

// Reads and checks saved data. Corrupted data is backed up and replaced, never crashes the app.
function readStore(key, fallback, isValid) {

    let raw = null;

    try {
        raw = localStorage.getItem(key);
    } catch (e) {
        return fallback;
    }

    if (raw === null) return fallback;

    try {
        const value = JSON.parse(raw);
        if (isValid(value)) return value;
    } catch (e) { /* fall through */ }

    try {
        localStorage.setItem(key + "_corrupt_backup", raw);
    } catch (e) { /* ignore */ }

    corruptedKeys.push(key);
    return fallback;
}

function writeStore(key, value) {

    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        notify("Could not save",
            "Browser storage is full or blocked, so your change was not saved.", "error", 6000);
        return false;
    }
}

function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Makes sure every saved parcel has every field the app expects
function sanitizeParcel(p) {

    if (!isPlainObject(p) || typeof p.id !== "string" || typeof p.companyId !== "string") return null;

    const base = {
        name: "Parcel", courier: "", source: "", destination: "",
        customerName: "", customerMobile: "", customerUser: "",
        expectedDate: todayISO(), slotHour: 14, slotLabel: "", notes: "",
        value: 0, payment: "Prepaid", fragile: false, hardAddress: false,
        pickupPoint: false, distanceKm: 100, mode: "standard",
        availabilityConfirmed: false, rescheduleCount: 0, cancellation: null,
        createdAt: new Date().toISOString(), demo: false
    };

    const rec = Object.assign(base, p);

    rec.checkpoints = (Array.isArray(p.checkpoints) ? p.checkpoints : []).filter(function(c) {
        return isPlainObject(c) && typeof c.status === "string" && typeof c.time === "string";
    });

    rec.activity = (Array.isArray(p.activity) ? p.activity : []).filter(function(a) {
        return isPlainObject(a) && typeof a.time === "string" && typeof a.title === "string";
    });

    rec.cases = (Array.isArray(p.cases) ? p.cases : []).filter(function(c) {
        return isPlainObject(c) && typeof c.id === "string";
    });

    if (!isValidDate(rec.expectedDate)) rec.expectedDate = todayISO();
    if (!ECO_MODES[rec.mode]) rec.mode = "standard";
    rec.value = Number(rec.value) || 0;
    rec.distanceKm = Math.max(1, Number(rec.distanceKm) || 100);
    rec.slotHour = Number(rec.slotHour) || 14;
    rec.customerMobile = String(rec.customerMobile || "");
    rec.customerUser = String(rec.customerUser || "");

    return rec;
}

function loadDB() {

    db.users = readStore(KEYS.users, {}, isPlainObject);

    Object.keys(db.users).forEach(function(k) {
        const u = db.users[k];
        if (!isPlainObject(u) || typeof u.hash !== "string" || typeof u.salt !== "string" || typeof u.username !== "string") {
            delete db.users[k];
        } else {
            u.role = u.role === "company" ? "company" : "customer";
        }
    });

    db.parcels = readStore(KEYS.parcels, [], Array.isArray)
        .map(sanitizeParcel)
        .filter(Boolean);

    db.prefs = readStore(KEYS.prefs, {}, isPlainObject);
    db.support = readStore(KEYS.support, [], Array.isArray);
}

function saveParcels() { return writeStore(KEYS.parcels, db.parcels); }
function saveUsers()   { return writeStore(KEYS.users, db.users); }
function saveSupport() { return writeStore(KEYS.support, db.support); }


/* ----- per-user preferences ----- */

let currentUser = null;
let currentParcelId = null;
let reminderParcelId = null;

function defaultPrefs() {
    return {
        availableFrom: 9, availableTo: 14, safe: null,
        notifications: true, sms: true, reminder: true, noticeDismissed: false
    };
}

function getPrefs() {

    if (!currentUser) return defaultPrefs();

    return Object.assign(defaultPrefs(), db.prefs[currentUser.username] || {});
}

function setPrefs(patch) {

    if (!currentUser) return;

    db.prefs[currentUser.username] = Object.assign(getPrefs(), patch);
    writeStore(KEYS.prefs, db.prefs);
}


/* ----- parcels of the logged-in user ----- */

function myParcels() {

    if (!currentUser) return [];

    const company = currentUser.role === "company";

    return db.parcels
        .filter(function(p) {
            return company ? p.companyId === currentUser.username : p.customerUser === currentUser.username;
        })
        .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function getParcel(id) {

    if (!currentUser) return null;

    const company = currentUser.role === "company";

    return db.parcels.find(function(p) {
        return p.id === id && (company ? p.companyId === currentUser.username : p.customerUser === currentUser.username);
    }) || null;
}

function parcelIdExists(id) {
    return db.parcels.some(function(p) { return p.id === id; });
}

function generateParcelId() {

    let id;

    do {
        id = "PC" + Math.floor(10000 + Math.random() * 90000);
    } while (parcelIdExists(id));

    return id;
}


/* ----- statuses ----- */

const NORMAL_STATUSES = ["Order Confirmed", "Dispatched", "Sorting Hub", "In Transit", "Out for Delivery", "Delivered"];

const STEP_OF = {
    "Order Confirmed": 0,
    "Dispatched": 1,
    "Sorting Hub": 1,
    "In Transit": 1,
    "Out for Delivery": 2,
    "Delivered": 3
};

function latestCp(rec) {

    if (rec.checkpoints.length) return rec.checkpoints[rec.checkpoints.length - 1];

    return { status: "Order Confirmed", location: rec.source || "-", time: rec.createdAt, note: "", by: rec.companyId };
}

function lastNormalStatus(rec) {

    for (let i = rec.checkpoints.length - 1; i >= 0; i--) {
        if (NORMAL_STATUSES.indexOf(rec.checkpoints[i].status) !== -1) return rec.checkpoints[i].status;
    }

    return "Order Confirmed";
}

// "active" (on its way), "delivered", "hold" (damaged) or "cancelled" (cancelled / refund)
function parcelPhase(rec) {

    const s = latestCp(rec).status;

    if (s === "Delivered") return "delivered";
    if (s === "Damaged") return "hold";
    if (s === "Cancelled" || s === "Refund Processing" || s === "Refund Completed") return "cancelled";

    return "active";
}

// Colour family of a status: blue = on the way, GREEN = DELIVERED ONLY,
// amber = delayed, red = damaged, purple = refund
function tone(status) {

    if (status === "Delivered") return "delivered";
    if (status === "Delayed" || status === "Delivery Attempt Failed") return "delayed";
    if (status === "Damaged") return "damaged";
    if (status === "Cancelled" || status === "Refund Processing" || status === "Refund Completed") return "refund";

    return "transit";
}

function statusChipClass(status) {

    return {
        transit: "status-delivery", delivered: "status-delivered",
        delayed: "status-delayed", damaged: "status-damaged", refund: "status-refund"
    }[tone(status)];
}

function openCases(rec) {
    return rec.cases.filter(function(c) { return c.status === "Open"; });
}

function needsAction(rec) {

    const s = latestCp(rec).status;

    return openCases(rec).length > 0 || s === "Delayed" || s === "Damaged" || s === "Delivery Attempt Failed";
}

function refundIsPending(rec) {
    return parcelPhase(rec) === "cancelled" && latestCp(rec).status !== "Refund Completed";
}

// Which statuses may be added next (so impossible journeys cannot be created)
function allowedStatuses(rec) {

    const latest = latestCp(rec).status;

    if (latest === "Delivered" || latest === "Refund Completed") return [];
    if (latest === "Cancelled") return ["Refund Processing"];
    if (latest === "Refund Processing") return ["Refund Completed"];

    const from = NORMAL_STATUSES.indexOf(lastNormalStatus(rec));

    return NORMAL_STATUSES.slice(from)
        .concat(["Delayed", "Delivery Attempt Failed", "Damaged", "Cancelled"]);
}

// Adds a checkpoint to a parcel (time always moves forward)
function pushCheckpoint(rec, status, location, note) {

    let time = new Date();
    const last = rec.checkpoints.length ? new Date(latestCp(rec).time) : null;

    if (last && !isNaN(last) && time <= last) {
        time = new Date(last.getTime() + 1000);
    }

    rec.checkpoints.push({
        status: status,
        location: location,
        note: note || "",
        time: time.toISOString(),
        by: currentUser ? currentUser.username : rec.companyId
    });
}

// Records something the user did, so it shows up in the history
function logAction(rec, icon, title, text) {

    rec.activity.push({
        time: new Date().toISOString(), icon: icon, title: title, text: text || "",
        by: currentUser ? currentUser.username : "", role: currentUser ? currentUser.role : ""
    });
}


/* =========================================================
   2. LOGIN AND REGISTRATION (demonstration only)
   ========================================================= */

const PBKDF2_ITERATIONS = 120000;

function bytesToB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

function b64ToBytes(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

// Salted PBKDF2-SHA256 hash. The password itself is never stored.
async function hashPassword(password, saltB64, iterations) {

    if (!(window.crypto && window.crypto.subtle)) {
        throw new Error("no-crypto");
    }

    const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(saltB64), iterations: iterations },
        keyMaterial, 256
    );

    return bytesToB64(new Uint8Array(bits));
}

function safeEqual(a, b) {

    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

    return diff === 0;
}

function findUser(idRaw) {

    const id = String(idRaw || "").trim().toLowerCase();

    if (db.users[id]) return db.users[id];

    return Object.keys(db.users).map(function(k) { return db.users[k]; })
        .find(function(u) { return u.email === id; }) || null;
}

function validateRegistration(v) {

    const errors = [];
    const company = v.role === "company";
    const maxName = company ? 50 : 40;

    if (v.name.length < 2 || v.name.length > maxName) {
        errors.push(company
            ? "Enter your company or post office name (2 to 50 characters)."
            : "Enter your full name (2 to 40 characters).");
    }

    if (!/^[a-z0-9_]{3,20}$/.test(v.username)) {
        errors.push("Username must be 3 to 20 characters: lowercase letters, numbers or underscore.");
    } else if (db.users[v.username]) {
        errors.push("That username is already taken.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) {
        errors.push("Enter a valid email address.");
    } else if (findUser(v.email)) {
        errors.push("That email is already registered.");
    }

    if (v.password.length < 8 || v.password.length > 64) {
        errors.push("Password must be 8 to 64 characters.");
    } else if (!/[A-Za-z]/.test(v.password) || !/[0-9]/.test(v.password)) {
        errors.push("Password must contain at least one letter and one number.");
    }

    if (v.password !== v.confirm) errors.push("The two passwords do not match.");

    return errors;
}

async function handleRegister(event) {

    event.preventDefault();

    const values = {
        name: $("regName").value.trim(),
        username: $("regUsername").value.trim().toLowerCase(),
        email: $("regEmail").value.trim().toLowerCase(),
        password: $("regPassword").value,
        confirm: $("regConfirm").value,
        role: authRole
    };

    const errors = validateRegistration(values);
    showErrors($("registerError"), errors);

    if (errors.length) return;

    const button = $("registerSubmit");
    setBusy(button, true);

    try {

        const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await hashPassword(values.password, salt, PBKDF2_ITERATIONS);

        db.users[values.username] = {
            username: values.username, name: values.name, email: values.email, role: values.role,
            salt: salt, hash: hash, iterations: PBKDF2_ITERATIONS,
            createdAt: new Date().toISOString()
        };

        if (!saveUsers()) {
            delete db.users[values.username];
            return;
        }

        $("registerForm").reset();
        startSession(values.username);
        notify("Account created", "Welcome to ParcelCare, " + values.name + "!", "success");

    } catch (e) {

        showErrors($("registerError"), [
            e.message === "no-crypto"
                ? "This browser cannot create secure password hashes here. Open the site over https or on localhost."
                : "Something went wrong while creating the account. Please try again."
        ]);

    } finally {
        setBusy(button, false);
    }
}

let failedLogins = 0;
let lockedUntil = 0;

async function handleLogin(event) {

    event.preventDefault();

    const id = $("loginId").value.trim();
    const password = $("loginPassword").value;
    const errorBox = $("loginError");

    if (Date.now() < lockedUntil) {
        const seconds = Math.ceil((lockedUntil - Date.now()) / 1000);
        showErrors(errorBox, ["Too many failed attempts. Try again in " + seconds + " seconds."]);
        return;
    }

    if (id === "" || password === "") {
        showErrors(errorBox, ["Enter your username (or email) and your password."]);
        return;
    }

    const button = $("loginSubmit");
    setBusy(button, true);

    try {

        const user = findUser(id);
        let ok = false;

        if (user) {
            const hash = await hashPassword(password, user.salt, user.iterations || PBKDF2_ITERATIONS);
            ok = safeEqual(hash, user.hash);
        }

        if (!ok) {

            failedLogins++;

            if (failedLogins >= 5) {
                lockedUntil = Date.now() + 30000;
                failedLogins = 0;
                showErrors(errorBox, ["Too many failed attempts. Please wait 30 seconds."]);
            } else {
                showErrors(errorBox, ["Incorrect username/email or password."]);
            }

            return;
        }

        failedLogins = 0;

        // the account must belong to the portal that was chosen
        if (user.role !== authRole) {

            const other = user.role === "company" ? "Company / Post Office" : "Customer";

            showErrors(errorBox, ["This account is registered as a " + other + " account. Please switch to the " +
                other + " tab above and log in there."]);
            return;
        }

        showErrors(errorBox, []);
        $("loginForm").reset();
        startSession(user.username);
        notify("Logged in", "Welcome back, " + user.name + "!", "success");

    } catch (e) {

        showErrors(errorBox, [
            e.message === "no-crypto"
                ? "This browser cannot check passwords securely here. Open the site over https or on localhost."
                : "Something went wrong while logging in. Please try again."
        ]);

    } finally {
        setBusy(button, false);
    }
}

function startSession(username) {

    writeSession(username);
    currentUser = db.users[username];
    currentParcelId = null;
    authRole = currentUser.role;
    showAppView();
}

function logout() {

    clearSession();

    closeAllModals();
    currentUser = null;
    currentParcelId = null;
    showAuthView();
    notify("Logged out", "See you soon!", "info", 3000);
}

function showAuthTab(tab) {

    const login = tab === "login";

    $("loginForm").hidden = !login;
    $("registerForm").hidden = login;
    $("tabLogin").setAttribute("aria-selected", String(login));
    $("tabRegister").setAttribute("aria-selected", String(!login));

    showErrors($("loginError"), []);
    showErrors($("registerError"), []);

    setTimeout(function() {
        $(login ? "loginId" : "regName").focus();
    }, 50);
}

let authRole = "customer";

function setAuthRole(role) {

    authRole = role === "company" ? "company" : "customer";

    const company = authRole === "company";

    $("roleCustomer").setAttribute("aria-selected", String(!company));
    $("roleCompany").setAttribute("aria-selected", String(company));

    $("roleHelp").textContent = company
        ? "For post offices, couriers and sellers: add bookings and update parcel tracking."
        : "For people receiving a parcel: track it, reschedule it and report problems.";

    $("loginHeading").textContent = company ? "Company login" : "Customer login";
    $("loginSub").textContent = company ? "Log in to manage your bookings." : "Log in to track your parcels.";
    $("regHeading").textContent = company ? "Create a company account" : "Create a customer account";
    $("regNameLabel").textContent = company ? "Company / post office name" : "Full name";
    $("regName").placeholder = company ? "e.g. Madurai Head Post Office" : "e.g. Bhavadharani S";

    showErrors($("loginError"), []);
    showErrors($("registerError"), []);
}

function showAuthView() {

    $("appView").hidden = true;
    $("authView").hidden = false;
    document.body.classList.add("on-auth");
    document.body.classList.remove("role-company", "role-customer");
    setAuthRole(authRole);
    showAuthTab("login");
    window.scrollTo(0, 0);
}

function showAppView() {

    $("authView").hidden = true;
    $("appView").hidden = false;
    document.body.classList.remove("on-auth");
    document.body.classList.toggle("role-company", currentUser.role === "company");
    document.body.classList.toggle("role-customer", currentUser.role !== "company");
    window.scrollTo(0, 0);
    renderAll();
}

// Password strength bar under the "create account" password box
function updatePasswordMeter() {

    const pw = $("regPassword").value;
    let score = 0;

    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

    const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
    const colors = ["#dc2626", "#dc2626", "#d97706", "#2563eb", "#16a34a"];

    if (pw.length === 0) {
        $("pwMeterBar").style.width = "0";
        $("pwMeterText").textContent = "Use at least 8 characters with a letter and a number.";
        return;
    }

    $("pwMeterBar").style.width = (score / 4 * 100 || 8) + "%";
    $("pwMeterBar").style.background = colors[score];
    $("pwMeterText").textContent = "Strength: " + labels[score];
}

function initAuth() {

    $("loginForm").addEventListener("submit", handleLogin);
    $("registerForm").addEventListener("submit", handleRegister);
    $("regPassword").addEventListener("input", updatePasswordMeter);

    // show / hide password
    document.querySelectorAll(".pw-toggle").forEach(function(btn) {

        btn.addEventListener("click", function() {

            const input = $(btn.dataset.target);
            const show = input.type === "password";

            input.type = show ? "text" : "password";
            btn.setAttribute("aria-pressed", String(show));
            btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
            btn.textContent = show ? "🙈" : "👁";
        });
    });
}


/* =========================================================
   3. PARCELS, DASHBOARD AND TRACKING
   ========================================================= */

const STATUS_ICONS = {
    "Order Confirmed": "📝", "Dispatched": "📤", "Sorting Hub": "🏭", "In Transit": "🚚",
    "Out for Delivery": "🛵", "Delivered": "✓", "Delayed": "⏳", "Delivery Attempt Failed": "🚪",
    "Damaged": "📦", "Cancelled": "✕", "Refund Processing": "💰", "Refund Completed": "✓"
};

const SLOT_LABELS = {
    10: "10:00 AM – 12:00 PM",
    14: "2:00 PM – 4:00 PM",
    17: "5:00 PM – 8:00 PM"
};

let freshCpTime = null;     // the checkpoint that was just added (gets a highlight)

function slotLabelOf(rec) {
    return rec.slotLabel || SLOT_LABELS[rec.slotHour] || fmtHour(rec.slotHour);
}

function expectedText(rec) {
    return fmtDate(rec.expectedDate) + ", " + slotLabelOf(rec);
}

function firstName() {
    return currentUser ? currentUser.name.split(" ")[0] : "User";
}

/* ----- drawing the whole page for the logged-in user ----- */

function renderAll() {

    if (!currentUser) return;

    const company = currentUser.role === "company";

    document.body.classList.toggle("role-company", company);
    document.body.classList.toggle("role-customer", !company);

    const name = company ? currentUser.name : firstName();

    $("profileName").textContent = name.length > 22 ? name.slice(0, 20) + "…" : name;
    $("profileInitial").textContent = name.charAt(0).toUpperCase();

    if (company) {
        $("companyName").textContent = currentUser.name.toUpperCase();
    } else {
        $("welcomeName").textContent = name.toUpperCase();
    }

    $("demoNotice").hidden = getPrefs().noticeDismissed;

    // words that change with the portal
    const labels = company
        ? ["Total Bookings", "Out for Delivery", "Needs Attention", "Refunds to Process"]
        : ["Total Parcels", "Out for Delivery", "Action Required", "Refund Pending"];

    labels.forEach(function(text, i) { $("statLabel" + (i + 1)).textContent = text; });

    $("listKicker").textContent = company ? "BOOKINGS" : "MY PARCELS";
    $("listTitle").textContent = company ? "Your Bookings" : "Your Parcels";
    $("listAddBtn").textContent = company ? "➕ New booking" : "🔎 Track a parcel";

    $("searchHeading").textContent = company ? "Find a Booking" : "Track Your Parcel";
    $("searchBtn").textContent = company ? "Open Booking" : "Track Parcel";

    $("searchHint").textContent = company
        ? "Type a Parcel ID to open one of your bookings."
        : "Enter the Parcel ID and the last 4 digits of the mobile number used for the booking. Your sender can tell you both.";

    renderStats();
    renderParcelList();
    renderActivity();
    renderTracking();
    renderReminder();
    renderSettings();
    renderSupport();
}

// "Track a parcel" button for customers, "New booking" for companies
function listAction() {

    if (currentUser && currentUser.role === "company") {
        openAddParcel();
    } else {
        focusSearch();
    }
}

function focusSearch() {

    const box = $("parcelSearch");

    box.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function() { box.focus(); }, 300);
}

function dismissNotice() {
    setPrefs({ noticeDismissed: true });
    $("demoNotice").hidden = true;
}

function renderStats() {

    const list = myParcels();

    const values = {
        totalParcels: list.length,
        outForDelivery: list.filter(function(p) { return latestCp(p).status === "Out for Delivery"; }).length,
        actionRequired: list.filter(needsAction).length,
        refundPending: list.filter(refundIsPending).length
    };

    Object.keys(values).forEach(function(id) {
        animateNumber($(id), values[id], 600);
    });
}

function parcelCardStatus(rec) {

    const s = latestCp(rec).status;

    if (parcelPhase(rec) === "active" && openCases(rec).length > 0) {
        return { text: "Action Required", cls: "issue" };
    }

    const cls = { transit: "delivering", delivered: "delivered", delayed: "delayed", damaged: "issue", refund: "refund" }[tone(s)];

    return { text: s, cls: s === "Order Confirmed" ? "neutral" : cls };
}

function renderParcelList() {

    const company = currentUser.role === "company";
    const all = myParcels();
    const query = company ? ($("bookingFilter").value || "").trim().toLowerCase() : "";

    const list = query === "" ? all : all.filter(function(p) {
        return (p.id + " " + p.name + " " + p.customerName).toLowerCase().indexOf(query) !== -1;
    });

    const box = $("parcelList");

    box.innerHTML = "";
    $("parcelEmpty").hidden = all.length > 0;

    if (all.length === 0) {

        $("emptyTitle").textContent = company ? "No bookings yet" : "No parcels yet";

        $("emptyText").textContent = company
            ? "Add a booking when a customer hands you a parcel. The customer tracks it with the Parcel ID."
            : "Enter the Parcel ID and the last 4 digits of the booking mobile number above to start tracking.";

        $("emptyActions").innerHTML = company
            ? '<button type="button" class="add-btn" onclick="openAddParcel()">➕ New booking</button>' +
              '<button type="button" class="ghost-btn" onclick="loadDemoParcels()">Load sample bookings</button>'
            : '<button type="button" class="add-btn" onclick="focusSearch()">🔎 Track a parcel</button>';
    }

    if (all.length > 0 && list.length === 0) {
        box.innerHTML = '<p class="empty-note">No bookings match "' + esc(query) + '".</p>';
    }

    list.forEach(function(rec) {

        const st = parcelCardStatus(rec);

        const card = document.createElement("div");
        card.className = "parcel-card" + (rec.id === currentParcelId ? " current" : "");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", "Open parcel " + rec.id);

        const subtitle = company
            ? esc(rec.name) + " • for " + esc(rec.customerName) + (rec.customerUser ? "" : " (not linked yet)")
            : esc(rec.name) + (rec.courier ? " • " + esc(rec.courier) : "");

        card.innerHTML =
            '<div class="parcel-card-icon">📦</div>' +
            '<div class="parcel-card-info"><strong>' + esc(rec.id) + "</strong>" +
            "<p>" + subtitle + (rec.demo ? " • sample" : "") + "</p></div>" +
            '<span class="parcel-status ' + st.cls + '">' + esc(st.text) + "</span>";

        card.addEventListener("click", function() { openParcel(rec.id, { scroll: true }); });

        card.addEventListener("keydown", function(event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openParcel(rec.id, { scroll: true });
            }
        });

        box.appendChild(card);
    });
}

// All events (checkpoints and user actions) of one parcel, oldest first
function eventsOf(rec) {

    const events = [];

    rec.checkpoints.forEach(function(c) {
        events.push({ kind: "cp", time: c.time, cp: c, parcel: rec });
    });

    rec.activity.forEach(function(a) {
        events.push({ kind: "act", time: a.time, act: a, parcel: rec });
    });

    return events.sort(function(a, b) { return a.time.localeCompare(b.time); });
}

function renderActivity() {

    const box = $("activityList");
    let events = [];

    myParcels().forEach(function(rec) {
        events = events.concat(eventsOf(rec));
    });

    events.sort(function(a, b) { return b.time.localeCompare(a.time); });
    events = events.slice(0, 6);

    if (events.length === 0) {
        box.innerHTML = '<p class="empty-note">Nothing has happened yet. Add a parcel to get started.</p>';
        return;
    }

    box.innerHTML = events.map(function(e) {

        const title = e.kind === "cp" ? e.cp.status : e.act.title;
        const icon = e.kind === "cp" ? STATUS_ICONS[e.cp.status] || "•" : e.act.icon || "•";
        const klass = e.kind === "cp" ? "tone-" + tone(e.cp.status) : "tone-action";

        return '<div class="activity-item ' + klass + '">' +
            '<span class="activity-dot">' + esc(icon) + "</span>" +
            "<div><strong>" + esc(title) + "</strong>" +
            "<p>" + esc(e.parcel.id) + " · " + esc(e.parcel.name) + "</p>" +
            "<small>" + esc(fmtDateTime(e.time)) + "</small></div></div>";

    }).join("");
}

function updateNavLinks(show) {

    ["#tracking", "#confidence"].forEach(function(href) {
        const link = document.querySelector('.nav-links a[href="' + href + '"]');
        if (link) link.style.display = show ? "" : "none";
    });
}

function renderTracking() {

    const rec = currentParcelId ? getParcel(currentParcelId) : null;
    const company = currentUser.role === "company";

    if (!rec) {
        currentParcelId = null;
        $("tracking").style.display = "none";
        $("confidence").style.display = "none";
        updateNavLinks(false);
        return;
    }

    const latest = latestCp(rec);

    $("tracking").style.display = "block";
    $("confidence").style.display = company ? "none" : "block";
    updateNavLinks(true);

    $("activeParcelId").textContent = (company ? "Booking " : "Parcel ") + rec.id;
    $("parcelSubtitle").textContent = rec.name + (rec.demo ? " (sample parcel)" : "");

    const chip = $("parcelStatus");
    chip.textContent = latest.status.toUpperCase();
    chip.className = "status " + statusChipClass(latest.status);

    $("parcelLocation").textContent = latest.location || "-";
    $("parcelDelivery").textContent = expectedText(rec);
    $("parcelUpdated").textContent = fmtDateTime(latest.time);
    $("parcelSource").textContent = rec.source || "-";
    $("parcelDestination").textContent = rec.destination || "-";
    $("parcelCourier").textContent = rec.courier || "-";
    $("parcelCustomer").textContent = rec.customerName + " · " + rec.customerMobile +
        (rec.customerUser ? " (account linked)" : " (not linked yet)");

    const notes = $("parcelNotes");
    notes.hidden = !rec.notes;
    notes.textContent = rec.notes ? "📝 Delivery instructions: " + rec.notes : "";

    $("casesTitle").textContent = company ? "Issues & reports raised by the customer" : "Issues & reports for this parcel";

    renderProgress(rec);
    renderBanner(rec);
    renderTimeline(rec);
    renderCases(rec);

    if (company) {
        renderCheckpointForm(rec);
    } else {
        renderConfidence();
    }
}

function renderProgress(rec) {

    const phase = parcelPhase(rec);
    const latest = latestCp(rec);
    const step = phase === "delivered" ? 3 : STEP_OF[lastNormalStatus(rec)];
    const t = tone(latest.status);

    const steps = ["stepOrdered", "stepShipped", "stepDelivery", "stepDelivered"].map($);
    const icons = ["📝", "📦", "🚚", "🏠"];
    const activeIcon = { transit: null, delayed: "⏳", damaged: "⚠️", refund: "💰", delivered: null }[t];

    steps.forEach(function(el, i) {

        el.classList.remove("completed", "active");
        const icon = el.querySelector("div");

        if (phase === "delivered" || i < step) {
            el.classList.add("completed");
            icon.textContent = "✓";
        } else if (i === step) {
            el.classList.add("active");
            icon.textContent = activeIcon || icons[i];
        } else {
            icon.textContent = icons[i];
        }
    });

    document.querySelector(".progress-container").dataset.state = t;
    $("deliveryHistory").dataset.state = t;
    $("progressFill").style.width = (step / 3 * 100) + "%";
}

function renderBanner(rec) {

    const s = latestCp(rec).status;
    const box = $("trackBanner");
    const t = tone(s);
    const company = currentUser.role === "company";

    let html = "";

    if (s === "Delayed" || s === "Delivery Attempt Failed") {
        html = "<span>⏳</span><p><strong>" + esc(s) + ".</strong> " + (company
            ? "The customer can see that this delivery is not on schedule."
            : "This delivery is not on schedule. You can report it or reschedule.") + "</p>" +
            (company ? "" : '<button type="button" onclick="openIssueFor(\'Delivery Delay\')">Report this delay</button>');
    } else if (s === "Damaged") {
        html = "<span>⚠️</span><p><strong>Damage recorded.</strong> " + (company
            ? "The customer may submit a damage report with a photo."
            : "Submit a report with a photo so it can be resolved.") + "</p>" +
            (company ? "" : '<button type="button" onclick="openDamage()">Report damage</button>');
    } else if (s === "Delivered") {
        html = "<span>🎉</span><p><strong>Delivered.</strong> " + (company
            ? "The customer can still dispute this if they did not receive it."
            : "If you did not actually receive it, start a dispute.") + "</p>" +
            (company ? "" : '<button type="button" onclick="verifyDelivery()">I didn\'t receive it</button>');
    } else if (t === "refund") {
        html = "<span>💰</span><p><strong>" + esc(s) + ".</strong> " + (company
            ? "The customer cancelled. Add the refund steps as checkpoints: Refund Processing, then Refund Completed."
            : "Follow the refund steps for this parcel.") + "</p>" +
            (company ? "" : '<button type="button" onclick="openRefund()">View refund status</button>');
    }

    box.hidden = html === "";
    box.className = "track-banner tone-" + t;
    box.innerHTML = html;
}

function actionTag(act) {

    if (act.by === currentUser.username) return "Your action";

    return act.role === "company" ? "Company" : "Customer";
}

function renderTimeline(rec) {

    const box = $("deliveryHistory");
    const events = eventsOf(rec);
    const latestTime = latestCp(rec).time;

    box.innerHTML = events.map(function(e) {

        if (e.kind === "act") {
            return '<div class="tl-item tone-action action">' +
                '<div class="tl-dot">' + esc(e.act.icon || "•") + "</div>" +
                '<div class="tl-body"><strong>' + esc(e.act.title) + ' <em class="tl-tag">' + esc(actionTag(e.act)) + '</em></strong>' +
                (e.act.text ? "<p>" + esc(e.act.text) + "</p>" : "") +
                "<span>" + esc(fmtDateTime(e.time)) + "</span></div></div>";
        }

        const c = e.cp;
        const isLatest = c.time === latestTime;

        return '<div class="tl-item tone-' + tone(c.status) + (isLatest ? " latest" : "") +
            (c.time === freshCpTime ? " fresh" : "") + '">' +
            '<div class="tl-dot">' + esc(STATUS_ICONS[c.status] || "•") + "</div>" +
            '<div class="tl-body"><strong>' + esc(c.status) +
            (isLatest ? ' <em class="tl-tag latest-tag">Latest</em>' : "") + "</strong>" +
            "<p>📍 " + esc(c.location || "-") + (c.note ? " · " + esc(c.note) : "") + "</p>" +
            "<span>" + esc(fmtDateTime(c.time)) + "</span></div></div>";

    }).join("");
}

function renderCases(rec) {

    const section = $("casesSection");

    section.hidden = rec.cases.length === 0;

    $("caseList").innerHTML = rec.cases.slice().reverse().map(function(c) {

        const open = c.status === "Open";
        const canResolve = open && currentUser.role === "company";

        return '<div class="case-item' + (open ? "" : " resolved") + '">' +
            '<div><strong>' + esc(c.kind) + ": " + esc(c.title) + "</strong>" +
            "<p>" + esc(c.id) + " · " + esc(fmtDateTime(c.time)) + (c.detail ? " · " + esc(c.detail) : "") + "</p></div>" +
            '<span class="case-status ' + (open ? "open" : "done") + '">' + esc(c.status) + "</span>" +
            (canResolve ? '<button type="button" class="mini-btn" onclick="resolveCase(\'' + esc(c.id) + '\')">Mark resolved</button>' : "") +
            "</div>";

    }).join("");
}

function resolveCase(caseId) {

    if (!currentUser || currentUser.role !== "company") return;

    const rec = getParcel(currentParcelId);
    const c = rec && rec.cases.find(function(x) { return x.id === caseId; });

    if (!c || c.status !== "Open") return;

    c.status = "Resolved";
    c.resolvedAt = new Date().toISOString();
    logAction(rec, "✅", "Case resolved by " + currentUser.name, c.id + ": " + c.title);

    if (saveParcels()) {
        notify("Marked as resolved", c.id + " is now closed.", "success");
        renderAll();
    }
}

function renderCheckpointForm(rec) {

    const allowed = allowedStatuses(rec);
    const select = $("cpStatus");
    const keep = select.value;
    const closed = allowed.length === 0;

    select.innerHTML = allowed.map(function(s) {
        return "<option>" + esc(s) + "</option>";
    }).join("");

    if (allowed.indexOf(keep) !== -1) {
        select.value = keep;
    } else if (allowed.length > 1 && NORMAL_STATUSES.indexOf(allowed[1]) !== -1) {
        select.value = allowed[1];        // the next step of the journey
    }

    ["cpStatus", "cpLocation", "cpNote", "cpSubmit"].forEach(function(id) {
        $(id).disabled = closed;
    });

    $("cpHint").textContent = closed
        ? "This parcel is " + latestCp(rec).status + ", so no more checkpoints can be added."
        : "Each checkpoint you add is shown to the customer on their tracking page. In a real system this could come from a courier API; here you type it in.";

    showErrors($("cpError"), []);
}

function handleCheckpoint(event) {

    event.preventDefault();

    if (!currentUser || currentUser.role !== "company") return;

    const rec = getParcel(currentParcelId);

    if (!rec) return;

    const status = $("cpStatus").value;
    const location = $("cpLocation").value.trim();
    const note = $("cpNote").value.trim();
    const errors = [];

    if (allowedStatuses(rec).indexOf(status) === -1) errors.push("That status cannot be added right now.");
    if (location.length < 2) errors.push("Enter the location (at least 2 characters).");
    if (location.length > 60) errors.push("Location is too long (60 characters at most).");
    if (note.length > 200) errors.push("Note is too long (200 characters at most).");

    showErrors($("cpError"), errors);

    if (errors.length) return;

    pushCheckpoint(rec, status, location, note);
    freshCpTime = latestCp(rec).time;

    if (status === "Cancelled" && !rec.cancellation) {
        rec.cancellation = { requestedAt: freshCpTime };
    }

    if (!saveParcels()) {
        rec.checkpoints.pop();
        return;
    }

    $("cpLocation").value = "";
    $("cpNote").value = "";

    notify("Checkpoint added",
        rec.id + " is now: " + status + " at " + location + ".", status === "Delivered" ? "success" : "info");

    renderAll();
}

/* ----- opening a parcel ----- */

function openParcel(id, opts) {

    const rec = getParcel(id);

    if (!rec) return;

    const wasHidden = $("tracking").style.display === "none";

    currentParcelId = id;
    $("problemResult").innerHTML = "";
    renderAll();

    if (wasHidden) confShownFor = null;     // let the score ring animate in again

    if (opts && opts.scroll) {

        const tracking = $("tracking");

        tracking.classList.remove("pop-in");
        void tracking.offsetWidth;
        tracking.classList.add("pop-in");

        tracking.scrollIntoView({ behavior: "smooth" });
    }
}

/* ----- search ----- */

function showProblem(title, message, isError) {

    $("problemResult").innerHTML =
        '<div class="problem-card' + (isError ? " error" : "") + '">' +
        '<div class="problem-icon">' + (isError ? "⚠️" : "ℹ️") + "</div>" +
        "<div><strong>" + esc(title) + "</strong><p>" + esc(message) + "</p></div></div>";
}

let linkFails = 0;
let linkLockedUntil = 0;

function searchParcel() {

    const id = $("parcelSearch").value.trim().toUpperCase();
    const company = currentUser.role === "company";

    $("problemResult").innerHTML = "";

    if (id === "") {
        showProblem("Enter a Parcel ID", "Type the Parcel ID, for example PC10234.", true);
        return;
    }

    if (!/^[A-Z0-9]{5,12}$/.test(id)) {
        showProblem("That doesn't look like a Parcel ID",
            "Parcel IDs have 5 to 12 letters or numbers, with no spaces or symbols.", true);
        return;
    }

    // a parcel that is already yours opens straight away
    if (getParcel(id)) {
        openParcel(id, { scroll: true });
        return;
    }

    if (company) {
        showProblem("Booking " + id + " was not found",
            myParcels().length === 0
                ? "You have no bookings yet. Create a booking first."
                : "None of your bookings has this ID. Check the ID or pick one from the list.", true);
        return;
    }

    // ---- customer: link a parcel to this account using the ID + last 4 digits of the booking mobile ----
    const digits = $("parcelVerify").value.trim();

    if (!/^[0-9]{4}$/.test(digits)) {
        showProblem("Enter the last 4 digits",
            "To protect privacy, also enter the last 4 digits of the mobile number used for the booking.", true);
        return;
    }

    if (Date.now() < linkLockedUntil) {
        showProblem("Too many wrong attempts",
            "Please wait " + Math.ceil((linkLockedUntil - Date.now()) / 1000) + " seconds and try again.", true);
        return;
    }

    const rec = db.parcels.find(function(p) { return p.id === id; });

    if (!rec || rec.customerMobile.slice(-4) !== digits) {

        linkFails++;

        if (linkFails >= 5) {
            linkLockedUntil = Date.now() + 30000;
            linkFails = 0;
        }

        showProblem("No parcel matches",
            "No parcel was found with that ID and those digits. Please check both with your sender.", true);
        return;
    }

    if (rec.customerUser && rec.customerUser !== currentUser.username) {
        showProblem("Already linked", "This parcel is already linked to another account.", true);
        return;
    }

    linkFails = 0;
    rec.customerUser = currentUser.username;
    logAction(rec, "🔗", "Parcel linked to your account", "Tracked by " + currentUser.name);

    if (!saveParcels()) {
        rec.customerUser = "";
        rec.activity.pop();
        return;
    }

    $("parcelVerify").value = "";
    notify("Parcel found", rec.id + " is now in your parcels.", "success");
    openParcel(id, { scroll: true });
}

/* ----- adding a parcel ----- */

function openAddParcel() {

    if (!currentUser || currentUser.role !== "company") {
        notify("Companies only", "Only company accounts can create bookings.", "info");
        return;
    }

    const form = $("addParcelForm");

    form.reset();
    showErrors($("apErrors"), []);

    $("apId").value = generateParcelId();
    $("apCourier").value = currentUser.name;
    $("apDate").min = todayISO();
    $("apDate").value = addDays(todayISO(), 3);

    $("apStatus").innerHTML = NORMAL_STATUSES.map(function(s) {
        return "<option>" + s + "</option>";
    }).join("");

    form.querySelector("details").open = false;

    openModal("addParcelModal");
}

function closeAddParcel() {
    closeModal("addParcelModal");
}

function regenParcelId() {
    $("apId").value = generateParcelId();
}

function handleAddParcel(event) {

    event.preventDefault();

    if (!currentUser || currentUser.role !== "company") return;

    const v = {
        customer: $("apCustomer").value.trim(),
        mobile: $("apMobile").value.trim(),
        id: $("apId").value.trim().toUpperCase(),
        name: $("apName").value.trim(),
        courier: $("apCourier").value.trim(),
        source: $("apSource").value.trim(),
        destination: $("apDestination").value.trim(),
        date: $("apDate").value,
        status: $("apStatus").value,
        location: $("apLocation").value.trim(),
        notes: $("apNotes").value.trim(),
        valueRaw: $("apValue").value.trim(),
        payment: $("apPayment").value,
        slot: parseInt($("apSlot").value, 10),
        distanceRaw: $("apDistance").value.trim(),
        fragile: $("apFragile").checked,
        hard: $("apHard").checked
    };

    const errors = [];

    if (!/^[A-Z0-9]{5,12}$/.test(v.id)) {
        errors.push("Parcel ID must be 5 to 12 letters or numbers.");
    } else if (parcelIdExists(v.id)) {
        errors.push("That Parcel ID is already in use. Choose another one or press New ID.");
    }

    if (v.customer.length < 2 || v.customer.length > 40) errors.push("Enter the customer's name (2 to 40 characters).");
    if (!/^[6-9][0-9]{9}$/.test(v.mobile)) errors.push("Enter a valid 10-digit customer mobile number.");
    if (v.name.length < 2 || v.name.length > 60) errors.push("Enter the parcel or product name (2 to 60 characters).");
    if (v.courier.length < 2 || v.courier.length > 40) errors.push("Enter the courier or service name (2 to 40 characters).");
    if (v.source.length < 2 || v.source.length > 60) errors.push("Enter the sender or source location (2 to 60 characters).");
    if (v.destination.length < 5 || v.destination.length > 100) errors.push("Enter the destination address (5 to 100 characters).");

    if (!isValidDate(v.date)) {
        errors.push("Choose a valid expected delivery date.");
    } else if (v.status !== "Delivered" && v.date < todayISO()) {
        errors.push("The expected delivery date cannot be in the past unless the parcel is already Delivered.");
    } else if (v.date > addDays(todayISO(), 180)) {
        errors.push("The expected delivery date is too far away (180 days at most).");
    }

    if (NORMAL_STATUSES.indexOf(v.status) === -1) errors.push("Choose a valid initial status.");
    if (v.location.length > 60) errors.push("Current location is too long (60 characters at most).");

    const value = v.valueRaw === "" ? 0 : Number(v.valueRaw);
    const distance = v.distanceRaw === "" ? 100 : Number(v.distanceRaw);

    if (isNaN(value) || value < 0 || value > 1000000) errors.push("Order value must be between 0 and 10,00,000.");
    if (isNaN(distance) || distance < 1 || distance > 5000) errors.push("Distance must be between 1 and 5000 km.");

    showErrors($("apErrors"), errors);

    if (errors.length) return;

    const rec = sanitizeParcel({
        id: v.id, companyId: currentUser.username, customerName: v.customer, customerMobile: v.mobile,
        customerUser: "", name: v.name, courier: v.courier,
        source: v.source, destination: v.destination, expectedDate: v.date,
        slotHour: v.slot, slotLabel: SLOT_LABELS[v.slot], notes: v.notes,
        value: Math.round(value), payment: v.payment, fragile: v.fragile,
        hardAddress: v.hard, distanceKm: Math.round(distance),
        createdAt: new Date().toISOString()
    });

    pushCheckpoint(rec, v.status, v.location || v.source,
        v.status === "Order Confirmed" ? "Parcel added" : "Initial status entered when the parcel was added");

    db.parcels.push(rec);

    if (!saveParcels()) {
        db.parcels.pop();
        return;
    }

    closeAddParcel();
    notify("Booking created",
        "Tell the customer: Parcel ID " + rec.id + " and the last 4 digits " + rec.customerMobile.slice(-4) + ".",
        "success", 9000);
    openParcel(rec.id, { scroll: true });
}

// Three sample parcels with clearly labelled made-up data
function loadDemoParcels() {

    if (!currentUser || currentUser.role !== "company") return;

    const now = Date.now();

    function cp(status, location, hoursAgo, note) {
        return {
            status: status, location: location, note: note || "",
            time: new Date(now - hoursAgo * 3600000).toISOString(), by: "demo"
        };
    }

    const samples = [
        {
            name: "Wireless headphones", courier: "DemoExpress", source: "Chennai", destination: "Anna Nagar, Madurai",
            expectedDate: todayISO(), slotHour: 17, value: 4500, payment: "Prepaid", fragile: true, hardAddress: true, distanceKm: 460,
            checkpoints: [
                cp("Order Confirmed", "Chennai warehouse", 72), cp("Dispatched", "Chennai", 60),
                cp("Sorting Hub", "Trichy Sorting Hub", 30), cp("In Transit", "Dindigul", 12),
                cp("Out for Delivery", "Madurai Delivery Hub", 3, "Sample data")
            ]
        },
        {
            name: "Books", courier: "DemoExpress", source: "Coimbatore", destination: "KK Nagar, Madurai",
            expectedDate: addDays(todayISO(), -1), slotHour: 14, value: 800, payment: "Prepaid", fragile: false, hardAddress: false, distanceKm: 215,
            checkpoints: [
                cp("Order Confirmed", "Coimbatore", 120), cp("Dispatched", "Coimbatore", 100),
                cp("In Transit", "Palani", 60), cp("Out for Delivery", "Madurai Delivery Hub", 30),
                cp("Delivered", "KK Nagar, Madurai", 26, "Sample data")
            ]
        },
        {
            name: "Clothing", courier: "DemoExpress", source: "Bengaluru", destination: "Tallakulam, Madurai",
            expectedDate: addDays(todayISO(), -1), slotHour: 10, value: 1999, payment: "Cash on delivery", fragile: false, hardAddress: false, distanceKm: 420,
            checkpoints: [
                cp("Order Confirmed", "Bengaluru", 100), cp("Dispatched", "Bengaluru", 90),
                cp("Sorting Hub", "Chennai Sorting Hub", 50), cp("Out for Delivery", "Madurai Delivery Hub", 30),
                cp("Delivery Attempt Failed", "Tallakulam, Madurai", 26, "Nobody was home (sample data)"),
                cp("Delayed", "Chennai Sorting Hub", 5, "Held at the hub (sample data)")
            ]
        }
    ];

    const added = [];

    samples.forEach(function(s, i) {

        const rec = sanitizeParcel(Object.assign({}, s, {
            id: generateParcelId(), companyId: currentUser.username, demo: true,
            customerName: "Sample Customer", customerMobile: "9876543210", customerUser: "",
            notes: "Sample parcel with made-up demo data.",
            createdAt: new Date(now - i * 1000).toISOString()
        }));

        rec.slotLabel = SLOT_LABELS[rec.slotHour];
        db.parcels.push(rec);
        added.push(rec);
    });

    if (!saveParcels()) {
        added.forEach(function() { db.parcels.pop(); });
        return;
    }

    notify("Sample bookings added",
        "Three sample bookings were created for \"Sample Customer\". A customer tracks one with its Parcel ID and the digits 3210.",
        "success", 9000);
    renderAll();
}


/* =========================================================
   4. ACTIONS (each one changes the saved parcel)
   ========================================================= */

// Fills a "Parcel" drop-down with the parcels that make sense for that action
function fillPicker(selectId, parcels, preferId, generalLabel) {

    const select = $(selectId);

    select.innerHTML = "";

    if (generalLabel) {
        const general = document.createElement("option");
        general.value = "";
        general.textContent = generalLabel;
        select.appendChild(general);
    }

    parcels.forEach(function(rec) {
        const option = document.createElement("option");
        option.value = rec.id;
        option.textContent = rec.id + " - " + rec.name + " (" + latestCp(rec).status + ")";
        select.appendChild(option);
    });

    if (parcels.length === 0 && !generalLabel) {
        const none = document.createElement("option");
        none.textContent = "No eligible parcels";
        none.value = "";
        select.appendChild(none);
    }

    const wanted = preferId || currentParcelId;

    if (wanted && parcels.some(function(p) { return p.id === wanted; })) {
        select.value = wanted;
    } else if (!generalLabel && parcels.length) {
        select.value = parcels[0].id;
    }
}

function parcelsWhere(test) {
    return myParcels().filter(test);
}

function isActiveParcel(rec) {
    return parcelPhase(rec) === "active";
}

function pickedParcel(selectId) {
    return getParcel($(selectId).value);
}

function needParcels(list, message) {

    if (myParcels().length === 0) {
        notify("Track a parcel first", "You have no parcels yet. Enter a Parcel ID and the last 4 digits at the top to start tracking.", "info");
        return false;
    }

    if (list.length === 0) {
        notify("Nothing to do here", message, "info");
        return false;
    }

    return true;
}


/* ----- Reschedule ----- */

function openReschedule(preferId) {

    const list = parcelsWhere(isActiveParcel);

    if (!needParcels(list, "Only parcels that are still on their way can be rescheduled.")) return;

    fillPicker("reschedParcel", list, typeof preferId === "string" ? preferId : null);

    document.querySelectorAll(".slot").forEach(function(item) {
        item.classList.remove("selected");
    });

    openModal("rescheduleModal");
}

function closeReschedule() {
    closeModal("rescheduleModal");
}

function selectSlot(slot) {

    document.querySelectorAll(".slot").forEach(function(item) {
        item.classList.remove("selected");
    });

    slot.classList.add("selected");
}

function confirmReschedule() {

    const rec = pickedParcel("reschedParcel");
    const selectedSlot = document.querySelector(".slot.selected");

    if (!rec) {
        notify("Choose a parcel", "Please choose which parcel to reschedule.", "warning");
        return;
    }

    if (!selectedSlot) {
        notify("Choose a slot", "Please select a delivery slot first.", "warning");
        return;
    }

    if (rec.rescheduleCount >= 3) {
        notify("Limit reached", rec.id + " has already been rescheduled 3 times.", "warning");
        return;
    }

    const day = selectedSlot.querySelector("strong").textContent;
    const range = selectedSlot.querySelector("span").textContent;
    const match = range.match(/(\d+):\d+\s*(AM|PM)/);
    const hour = match ? (parseInt(match[1], 10) % 12) + (match[2] === "PM" ? 12 : 0) : rec.slotHour;

    if (day === "Today" && hour <= new Date().getHours()) {
        notify("That slot has passed", "Choose a later slot or a slot tomorrow.", "warning");
        return;
    }

    rec.expectedDate = day === "Today" ? todayISO() : addDays(todayISO(), 1);
    rec.slotHour = hour;
    rec.slotLabel = range;
    rec.availabilityConfirmed = false;
    rec.rescheduleCount++;

    logAction(rec, "🕒", "Delivery rescheduled", day + ", " + range);

    if (!saveParcels()) return;

    closeReschedule();
    notify("Delivery rescheduled", rec.id + " will now arrive " + day.toLowerCase() + ", " + range + ".", "success");
    renderAll();
}


/* ----- Report an issue ----- */

let selectedIssue = "";

function openIssue(preferId) {

    const list = myParcels();

    if (!needParcels(list, "")) return;

    selectedIssue = "";

    document.querySelectorAll(".issue-option").forEach(function(item) {
        item.classList.remove("selected");
    });

    fillPicker("issueParcel", list, typeof preferId === "string" ? preferId : null);
    openModal("issueModal");
}

// Opens the issue window with one problem already chosen
function openIssueFor(type) {

    openIssue();

    document.querySelectorAll(".issue-option").forEach(function(option) {
        if (option.querySelector("strong").textContent === type) selectIssue(option, type);
    });
}

function closeIssue() {

    closeModal("issueModal");
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

    const rec = pickedParcel("issueParcel");

    if (!rec) {
        notify("Choose a parcel", "Please choose which parcel has the problem.", "warning");
        return;
    }

    if (selectedIssue === "") {
        notify("Select an issue", "Please choose what went wrong first.", "warning");
        return;
    }

    if (selectedIssue === "Parcel Not Received" && parcelPhase(rec) !== "delivered") {
        notify("Not marked as delivered", rec.id + " is not marked Delivered yet. Use \"Delivery Delay\" instead.", "warning", 6000);
        return;
    }

    const duplicate = rec.cases.some(function(c) { return c.status === "Open" && c.title === selectedIssue; });

    if (duplicate) {
        notify("Already reported", "There is already an open \"" + selectedIssue + "\" case for " + rec.id + ".", "warning");
        return;
    }

    const issue = selectedIssue;
    const ticket = makeId("TKT-");

    rec.cases.push({ id: ticket, kind: "Issue", title: issue, detail: "", status: "Open", time: new Date().toISOString() });
    logAction(rec, "🛠️", "Issue reported", issue + " (" + ticket + ")");

    if (!saveParcels()) {
        rec.cases.pop();
        rec.activity.pop();
        return;
    }

    closeIssue();
    notify("Issue submitted", "Ticket " + ticket + "\nParcel: " + rec.id + "\nStatus: Open", "success", 6000);
    renderAll();

    if (issue === "Cancellation / Refund" && isActiveParcel(rec)) openRefund(rec.id);
}


/* ----- Report damage ----- */

function openDamage(preferId) {

    const list = myParcels();

    if (!needParcels(list, "")) return;

    $("damageType").value = "";
    $("damageDescription").value = "";
    $("damageProof").value = "";

    fillPicker("damageParcel", list, typeof preferId === "string" ? preferId : null);
    openModal("damageModal");
}

function closeDamage() {
    closeModal("damageModal");
}

function submitDamage() {

    const rec = pickedParcel("damageParcel");
    const damageType = $("damageType").value;
    const description = $("damageDescription").value.trim();
    const proof = $("damageProof").files[0];

    if (!rec) {
        notify("Choose a parcel", "Please choose the damaged parcel.", "warning");
        return;
    }

    if (damageType === "") {
        notify("Damage type missing", "Please select the damage type.", "warning");
        return;
    }

    if (description.length < 10) {
        notify("Description too short", "Please describe the damage in at least 10 characters.", "warning");
        return;
    }

    if (!proof) {
        notify("Proof missing", "Please upload a photo as proof.", "warning");
        return;
    }

    if (!/^image\/(jpeg|png|webp|gif)$/.test(proof.type)) {
        notify("Wrong file type", "The proof must be a JPG, PNG, WEBP or GIF image.", "warning");
        return;
    }

    if (proof.size > 5 * 1024 * 1024) {
        notify("File too large", "Please choose a photo smaller than 5 MB.", "warning");
        return;
    }

    const caseId = makeId("DMG-");

    rec.cases.push({
        id: caseId, kind: "Damage report", title: damageType,
        detail: "Photo: " + proof.name + ". " + description,
        status: "Open", time: new Date().toISOString()
    });

    logAction(rec, "📸", "Damage reported", damageType + " (photo: " + proof.name + ")");

    if (!saveParcels()) {
        rec.cases.pop();
        rec.activity.pop();
        return;
    }

    closeDamage();
    notify("Damage report submitted",
        "Report " + caseId + "\nParcel: " + rec.id + "\nOnly the photo name is saved in this demo.", "success", 6000);
    renderAll();
}


/* ----- Delivery verification (parcel marked delivered but not received) ----- */

function verifyDelivery(preferId) {

    const list = parcelsWhere(function(p) { return parcelPhase(p) === "delivered"; });

    if (!needParcels(list, "Delivery verification is only for parcels marked Delivered. None of your parcels are.")) return;

    fillPicker("verifyParcel", list, typeof preferId === "string" ? preferId : null);
    updateVerifyInfo();
    openModal("verificationModal");
}

function updateVerifyInfo() {

    const rec = pickedParcel("verifyParcel");

    $("verifyBoxId").textContent = rec ? "Parcel " + rec.id : "-";
    $("verifyBoxText").textContent = rec ? "Marked as delivered on " + fmtDateTime(latestCp(rec).time) : "-";
}

function closeVerification() {
    closeModal("verificationModal");
}

function reportNotReceived() {

    const rec = pickedParcel("verifyParcel");

    if (!rec) {
        notify("Choose a parcel", "Please choose a delivered parcel.", "warning");
        return;
    }

    const title = "Marked delivered but not received";

    if (rec.cases.some(function(c) { return c.status === "Open" && c.title === title; })) {
        notify("Already reported", "A dispute for " + rec.id + " is already open.", "warning");
        return;
    }

    const caseId = makeId("DSP-");

    rec.cases.push({
        id: caseId, kind: "Delivery dispute", title: title,
        detail: "Delivered " + fmtDateTime(latestCp(rec).time) + " at " + latestCp(rec).location,
        status: "Open", time: new Date().toISOString()
    });

    logAction(rec, "🔐", "Delivery dispute opened", caseId);

    if (!saveParcels()) {
        rec.cases.pop();
        rec.activity.pop();
        return;
    }

    closeVerification();
    notify("Delivery dispute created", "Dispute " + caseId + "\nParcel: " + rec.id + "\nStatus: Verification in progress", "info", 6000);
    renderAll();
}


/* ----- Safe delivery preference (applies to all your parcels) ----- */

let selectedSafePlace = "";
let safeSaved = false;

const SAFE_OPTIONS = {
    me:        { label: "Only me (OTP handover)" },
    trusted:   { label: "Trusted person" },
    reception: { label: "Reception / security desk" },
    spot:      { label: "Safe spot (photo proof)" }
};

function openSafeDelivery() {

    safeSaved = false;
    selectedSafePlace = "";

    $("safeResult").classList.remove("show");
    $("safeResult").innerHTML = "";
    $("safeSaveBtn").textContent = "Save Preference";
    $("trustedFields").classList.remove("show");

    const options = document.querySelectorAll(".safe-option");

    options.forEach(function(item) {
        item.classList.remove("selected");
    });

    // show the preference that was saved earlier
    const saved = getPrefs().safe;

    if (saved && SAFE_OPTIONS[saved.type]) {

        selectedSafePlace = saved.type;
        options[Object.keys(SAFE_OPTIONS).indexOf(saved.type)].classList.add("selected");

        if (saved.type === "trusted") {
            $("trustedFields").classList.add("show");
            $("trustedName").value = saved.name || "";
            $("trustedMobile").value = saved.mobile || "";
            $("trustedRelation").value = saved.relation || "";
        }
    }

    openModal("safeDeliveryModal");
}

function closeSafeDelivery() {
    closeModal("safeDeliveryModal");
}

function selectSafePlace(option, type) {

    document.querySelectorAll(".safe-option").forEach(function(item) {
        item.classList.remove("selected");
    });

    option.classList.add("selected");

    selectedSafePlace = type;

    // only "Trusted person" needs extra details
    $("trustedFields").classList.toggle("show", type === "trusted");

    // choosing again after saving: go back to "Save Preference"
    if (safeSaved) {
        safeSaved = false;
        $("safeSaveBtn").textContent = "Save Preference";
        $("safeResult").classList.remove("show");
    }
}

function saveSafePlace() {

    // after saving, the same button simply closes the window
    if (safeSaved) {
        closeSafeDelivery();
        return;
    }

    if (selectedSafePlace === "") {
        notify("Choose an option", "Please select who can receive your parcels.", "warning");
        return;
    }

    const pref = {
        type: selectedSafePlace,
        label: SAFE_OPTIONS[selectedSafePlace].label,
        time: Date.now()
    };

    let message = "";

    if (selectedSafePlace === "trusted") {

        const name = $("trustedName").value.trim();
        const mobile = $("trustedMobile").value.trim();
        const relation = $("trustedRelation").value;

        if (name.length < 2) {
            notify("Name needed", "Enter the full name of the person you trust.", "warning");
            $("trustedName").focus();
            return;
        }

        if (!/^[6-9][0-9]{9}$/.test(mobile)) {
            notify("Check the mobile number", "Enter a valid 10-digit mobile number.", "warning");
            $("trustedMobile").focus();
            return;
        }

        if (relation === "") {
            notify("Relationship needed", "Select how this person is related to you.", "warning");
            $("trustedRelation").focus();
            return;
        }

        pref.name = name;
        pref.mobile = mobile;
        pref.relation = relation;
        pref.pin = String(Math.floor(1000 + Math.random() * 9000));

        message =
            "<strong>✓ " + esc(name) + " (" + esc(relation) + ") is now authorized.</strong>" +
            '<div class="pin-row">Handover PIN <span class="pin">' + pref.pin + "</span></div>" +
            "<ul>" +
            "<li>In a real system the PIN would be sent to XXXXXX" + esc(mobile.slice(-4)) + " by SMS.</li>" +
            "<li>The courier app would show only this person's name and ask for the PIN and a photo ID.</li>" +
            "<li>You would get an alert the moment the parcel is handed over.</li>" +
            "<li>You can remove this person at any time by choosing another option.</li>" +
            "</ul>";

    } else if (selectedSafePlace === "me") {

        message =
            "<strong>✓ Only you can receive the parcel.</strong>" +
            "<ul><li>A 4-digit OTP would be sent to your phone on delivery day.</li>" +
            "<li>The courier could not complete the delivery without it.</li></ul>";

    } else if (selectedSafePlace === "reception") {

        message =
            "<strong>✓ Reception / security desk selected.</strong>" +
            "<ul><li>The courier would collect the staff member's name and signature.</li>" +
            "<li>A photo of the handover would be added to your delivery history.</li></ul>";

    } else {

        message =
            "<strong>✓ Safe spot selected.</strong>" +
            "<ul><li>The courier would upload a photo and GPS location when leaving the parcel.</li>" +
            "<li>Cash-on-delivery and high-value parcels never use this option. They use OTP handover instead.</li></ul>";
    }

    setPrefs({ safe: pref });

    $("safeResult").innerHTML = message;
    $("safeResult").classList.add("show");

    safeSaved = true;
    $("safeSaveBtn").textContent = "Done";

    notify("Safe delivery preference saved", pref.label, "success");

    // the preference changes the delivery score
    renderAll();
}


/* ----- Missed-delivery prevention (reminder) ----- */

function renderReminder() {

    const box = $("preventionSection");

    if (!currentUser || currentUser.role !== "customer") {
        box.hidden = true;
        reminderParcelId = null;
        return;
    }

    const out = myParcels().filter(function(p) { return latestCp(p).status === "Out for Delivery"; });
    const rec = out.find(function(p) { return p.id === currentParcelId; }) || out[0];

    if (!rec || !getPrefs().reminder) {
        box.hidden = true;
        reminderParcelId = null;
        return;
    }

    reminderParcelId = rec.id;
    box.hidden = false;

    $("reminderText").textContent =
        rec.id + " (" + rec.name + ") is out for delivery. Expected " + expectedText(rec) + "." +
        (rec.availabilityConfirmed ? " ✓ You confirmed you will be home." : "");
}

function confirmAvailability() {

    const rec = getParcel(reminderParcelId);

    if (!rec) return;

    if (rec.availabilityConfirmed) {
        notify("Already confirmed", "You already told us you will be home for " + rec.id + ".", "info");
        return;
    }

    rec.availabilityConfirmed = true;
    logAction(rec, "✓", "Availability confirmed", "You will be home for the delivery.");

    if (saveParcels()) {
        notify("Availability confirmed", rec.id + " will be delivered on " + fmtDate(rec.expectedDate) + ".", "success");
        renderAll();
    }
}


/* ----- Cancellation and refund ----- */

function openRefund(preferId) {

    const list = parcelsWhere(function(p) {
        return parcelPhase(p) === "active" || parcelPhase(p) === "cancelled";
    });

    if (!needParcels(list, "Delivered parcels cannot be cancelled. Use Delivery Verification if there is a problem.")) return;

    fillPicker("refundParcel", list, typeof preferId === "string" ? preferId : null);
    refreshRefundView();
    openModal("refundModal");
}

function closeRefund() {
    closeModal("refundModal");
}

function refreshRefundView() {

    const rec = pickedParcel("refundParcel");

    if (!rec) return;

    const status = latestCp(rec).status;
    const stage = { "Cancelled": 1, "Refund Processing": 2, "Refund Completed": 3 }[status] || 0;

    $("refundBoxId").textContent = "Parcel " + rec.id;
    $("refundBoxText").textContent = "Currently: " + status;

    ["rs1", "rs2", "rs3"].forEach(function(id, i) {
        const step = $(id);
        step.classList.toggle("active", i < stage);
        step.querySelector("span").textContent = i < stage ? "✓" : String(i + 1);
    });

    if (rec.payment === "Cash on delivery") {
        $("refundAmount").textContent = "No refund needed: nothing was paid online (cash on delivery).";
    } else if (rec.value > 0) {
        $("refundAmount").textContent = "Refund Amount: " + money(rec.value);
    } else {
        $("refundAmount").textContent = "Refund Amount: not specified (no order value was entered).";
    }

    const button = $("refundBtn");

    button.disabled = stage > 0;
    button.textContent = stage > 0 ? "Cancellation already requested" : "Request Cancellation";
}

function requestCancellation() {

    const rec = pickedParcel("refundParcel");

    if (!rec) {
        notify("Choose a parcel", "Please choose the parcel to cancel.", "warning");
        return;
    }

    if (parcelPhase(rec) !== "active") {
        notify("Cannot cancel", rec.id + " cannot be cancelled in its current state.", "warning");
        return;
    }

    if (!confirm("Are you sure you want to cancel Parcel " + rec.id + "?")) return;

    pushCheckpoint(rec, "Cancelled", "Customer request", "Cancellation requested by " + currentUser.username);
    rec.cancellation = { requestedAt: latestCp(rec).time };
    freshCpTime = latestCp(rec).time;

    if (!saveParcels()) {
        rec.checkpoints.pop();
        rec.cancellation = null;
        return;
    }

    notify("Cancellation requested",
        rec.id + " is cancelled. Refund steps now appear in the history (advance them with checkpoints).", "success", 6000);

    refreshRefundView();
    renderAll();
}


/* =========================================================
   6. ASSISTANT, SUPPORT, SETTINGS, PROFILE
   ========================================================= */

function getHelp(problem) {

    const result = $("helpResult");
    const rec = currentParcelId ? getParcel(currentParcelId) : null;

    const context = rec
        ? "Your open parcel " + rec.id + " is \"" + latestCp(rec).status + "\" (last updated " + fmtDateTime(latestCp(rec).time) + "). "
        : "Tip: open a parcel first so the suggestions can use its details. ";

    const advice = {
        late: {
            text: "Report a delivery delay through the Issue Resolution Center.",
            buttons: [["Report a delay", "openIssueFor('Delivery Delay')"]]
        },
        missing: {
            text: "Use Delivery Verification to report that the parcel was not received. It only works for parcels marked Delivered.",
            buttons: [["Report not received", "verifyDelivery()"]]
        },
        damaged: {
            text: "Submit a damage report with a photo as proof.",
            buttons: [["Report damage", "openDamage()"]]
        },
        unavailable: {
            text: "Reschedule the delivery or choose a Safe Delivery preference.",
            buttons: [["Reschedule", "openReschedule()"], ["Safe delivery", "openSafeDelivery()"]]
        }
    }[problem];

    if (!advice) return;

    result.innerHTML =
        "<p>" + esc(context) + "</p>" +
        "<p>💡 <strong>Recommended action:</strong> " + esc(advice.text) + "</p>" +
        '<div class="help-buttons">' +
        advice.buttons.map(function(b) {
            return '<button type="button" onclick="' + b[1] + '">' + esc(b[0]) + "</button>";
        }).join("") + "</div>";

    result.classList.remove("fade-in");
    void result.offsetWidth;
    result.classList.add("fade-in");
}

/* ----- support ----- */

function contactSupport() {

    $("supportSubject").value = "";
    $("supportMessage").value = "";

    fillPicker("supportParcel", myParcels(), null, "General question (no parcel)");
    $("supportParcel").value = currentParcelId && getParcel(currentParcelId) ? currentParcelId : "";

    openModal("supportModal");
}

function closeSupport() {
    closeModal("supportModal");
}

function submitSupport() {

    const subject = $("supportSubject").value;
    const message = $("supportMessage").value.trim();

    if (subject === "") {
        notify("Choose a subject", "Please select what your request is about.", "warning");
        return;
    }

    if (message.length < 10) {
        notify("Message too short", "Please write at least 10 characters.", "warning");
        return;
    }

    const ticket = {
        id: makeId("SUP-"), owner: currentUser.username, parcelId: $("supportParcel").value,
        subject: subject, message: message, time: new Date().toISOString(), status: "Received"
    };

    db.support.push(ticket);

    if (!saveSupport()) {
        db.support.pop();
        return;
    }

    closeSupport();
    notify("Support request sent", "Reference " + ticket.id + ". It is saved in this demo; no real team will reply.", "success", 6000);
    renderSupport();
}

function renderSupport() {

    const mine = db.support
        .filter(function(t) { return t.owner === currentUser.username; })
        .slice(-3)
        .reverse();

    $("supportList").innerHTML = mine.length === 0 ? "" :
        "<h3>Your recent requests</h3>" + mine.map(function(t) {
            return '<div class="support-item"><strong>' + esc(t.id) + " · " + esc(t.subject) + "</strong>" +
                "<span>" + esc(fmtDateTime(t.time)) + (t.parcelId ? " · " + esc(t.parcelId) : "") +
                " · " + esc(t.status) + "</span></div>";
        }).join("");
}

function viewHelp() {
    openModal("helpModal");
}

function closeHelp() {
    closeModal("helpModal");
}

/* ----- settings ----- */

function initSettingsControls() {

    ["availableFrom", "availableTo"].forEach(function(id) {

        const select = $(id);
        select.innerHTML = "";

        for (let h = 5; h <= 23; h++) {
            const option = document.createElement("option");
            option.value = h;
            option.textContent = fmtHour(h);
            select.appendChild(option);
        }
    });

    [["setNotifications", "notifications", "Delivery notifications"],
     ["setSms", "sms", "SMS alerts"],
     ["setReminder", "reminder", "Missed delivery reminder"]].forEach(function(item) {

        $(item[0]).addEventListener("change", function() {

            const patch = {};
            patch[item[1]] = this.checked;
            setPrefs(patch);

            notify(item[2], this.checked ? "Turned on ✓" : "Turned off", this.checked ? "success" : "info", 2500);
            renderReminder();
        });
    });
}

function renderSettings() {

    const p = getPrefs();

    $("setNotifications").checked = p.notifications;
    $("setSms").checked = p.sms;
    $("setReminder").checked = p.reminder;
    $("availableFrom").value = p.availableFrom;
    $("availableTo").value = p.availableTo;
}

function saveAvailability() {

    const from = parseInt($("availableFrom").value, 10);
    const to = parseInt($("availableTo").value, 10);

    if (from >= to) {

        notify("Check your times", "The end time must be later than the start time.", "warning");

        const saved = getPrefs();
        $("availableFrom").value = saved.availableFrom;
        $("availableTo").value = saved.availableTo;
        return;
    }

    setPrefs({ availableFrom: from, availableTo: to });

    notify("Availability saved", "You are home " + fmtHour(from) + " to " + fmtHour(to) + ".", "success", 3000);
    renderConfidence();
}

/* ----- profile ----- */

function openProfile() {

    if (!currentUser) return;

    const company = currentUser.role === "company";

    $("profileAvatarLg").textContent = currentUser.name.charAt(0).toUpperCase();
    $("profileFullName").textContent = currentUser.name;
    $("profileUsername").textContent = "@" + currentUser.username;
    $("profileRole").textContent = company ? "Company / Post Office" : "Customer";
    $("profileEmail").textContent = currentUser.email;
    $("profileSince").textContent = fmtDate(currentUser.createdAt.slice(0, 10));
    $("profileCountLabel").textContent = company ? "Bookings" : "Parcels";
    $("profileParcels").textContent = myParcels().length;
    $("profileTickets").textContent = db.support.filter(function(t) { return t.owner === currentUser.username; }).length;

    openModal("profileModal");
}

function closeProfile() {
    closeModal("profileModal");
}

function clearMyData() {

    const company = currentUser.role === "company";

    if (!confirm(company
        ? "Delete all your bookings and preferences from this browser? Your account stays."
        : "Remove your linked parcels, preferences and support requests from this browser? Your account stays. The company's bookings are not deleted.")) return;

    const me = currentUser.username;

    if (company) {
        db.parcels = db.parcels.filter(function(p) { return p.companyId !== me; });
    } else {
        db.parcels.forEach(function(p) {
            if (p.customerUser === me) p.customerUser = "";
        });
    }

    db.support = db.support.filter(function(t) { return t.owner !== me; });
    delete db.prefs[me];

    saveParcels();
    saveSupport();
    writeStore(KEYS.prefs, db.prefs);

    currentParcelId = null;
    closeProfile();
    renderAll();
    notify("Data removed", "Your data was removed from this browser.", "info");
}


/* =========================================================
   5. DELIVERY CONFIDENCE ENGINE + ECO DELIVERY
   A simple rule-based score. Every point is explained on screen.
   It uses only data saved in your parcels and preferences
   (no weather, no live traffic, no artificial intelligence).
   ========================================================= */

// grams of CO2 per parcel-km (average estimates used for the demo)
const ECO_MODES = {
    express:  { name: "Express",  g: 210, days: "Next day",  info: "Dedicated vehicle trip" },
    standard: { name: "Standard", g: 120, days: "2 days",    info: "Normal delivery route" },
    eco:      { name: "Eco",      g: 45,  days: "3–4 days",  info: "Batched with nearby orders, fixed slot" }
};

let confShownFor = null;     // which parcel the ring is currently showing
let lastShownScore = 0;

// How many "Delivery Attempt Failed" checkpoints exist on the user's parcels (max 3 counted)
function failedAttempts() {

    let count = 0;

    myParcels().forEach(function(p) {
        p.checkpoints.forEach(function(c) {
            if (c.status === "Delivery Attempt Failed") count++;
        });
    });

    return Math.min(3, count);
}

// Days past the expected date (or 1 if the parcel is marked Delayed)
function lateInfo(rec) {

    if (parcelPhase(rec) !== "active") return { days: 0, note: "" };

    const diff = Math.round(
        (new Date(todayISO() + "T00:00:00") - new Date(rec.expectedDate + "T00:00:00")) / 86400000
    );

    if (diff > 0) {
        return { days: diff, note: "The expected date (" + fmtDate(rec.expectedDate) + ") has passed." };
    }

    if (latestCp(rec).status === "Delayed") {
        return { days: 1, note: "The latest checkpoint says this parcel is delayed." };
    }

    return { days: 0, note: "" };
}

function engineInput(rec) {

    const late = lateInfo(rec);

    return {
        etaHour: rec.slotHour,
        distanceKm: rec.distanceKm,
        cod: rec.payment === "Cash on delivery",
        fragile: rec.fragile,
        highValue: rec.value >= 20000,
        hard: rec.hardAddress && !rec.pickupPoint,
        lateDays: late.days,
        lateNote: late.note,
        confirmed: rec.availabilityConfirmed,
        mode: rec.mode
    };
}

function userInput() {

    const p = getPrefs();

    return {
        availableFrom: p.availableFrom,
        availableTo: p.availableTo,
        missed: failedAttempts(),
        safeType: p.safe ? p.safe.type : "me",
        safeName: p.safe && p.safe.name ? p.safe.name : ""
    };
}

function calculateDeliveryScore(p, u) {

    const factors = [];

    function add(label, points, note) {
        if (points !== 0) {
            factors.push({ label: label, points: points, note: note });
        }
    }

    add("Failed delivery attempts", -u.missed * 7,
        u.missed + " failed delivery attempt" + (u.missed === 1 ? " is" : "s are") + " recorded on your parcels.");

    const inWindow = p.etaHour >= u.availableFrom && p.etaHour <= u.availableTo;

    add("Arrival vs your availability", inWindow ? 0 : -22,
        "Arrival at " + fmtHour(p.etaHour) + " is outside your home hours (" +
        fmtHour(u.availableFrom) + " to " + fmtHour(u.availableTo) + ").");

    add("Hard-to-reach address", p.hard ? -10 : 0,
        "Gated entry or a hard-to-find address can slow the courier.");

    add("Running late", -Math.min(12, p.lateDays * 5), p.lateNote);

    add("Cash on delivery", p.cod ? -8 : 0, "Someone must be at home with payment.");
    add("Fragile parcel", p.fragile ? -5 : 0, "Needs a careful handover, so a retry is riskier.");
    add("High-value parcel", p.highValue ? -7 : 0, "Needs your signature or OTP in person.");

    add("Verified trusted person", u.safeType === "trusted" ? 12 : 0,
        u.safeName + " can receive it, but only with the PIN and a photo ID.");

    add("Reception can accept it", u.safeType === "reception" && !p.cod ? 10 : 0,
        "Staff at the desk can sign for it, so a missed visit is not a failed delivery.");

    add("Safe spot with photo proof", u.safeType === "spot" && !p.cod && !p.highValue ? 14 : 0,
        "The courier can leave it at your safe spot and must upload photo and GPS proof.");

    add("You confirmed availability", p.confirmed ? 10 : 0,
        "You told us you will be home for this delivery.");

    add("Eco delivery: fixed slot", p.mode === "eco" ? -4 : 0,
        "Batched deliveries have less flexible timing.");

    add("Express delivery: direct courier", p.mode === "express" ? 3 : 0,
        "Fewer handovers means fewer things that can go wrong.");

    const total = factors.reduce(function(sum, f) { return sum + f.points; }, 100);

    return {
        score: Math.max(5, Math.min(98, total)),
        factors: factors,
        inWindow: inWindow
    };
}

function scoreBand(score) {
    if (score >= 75) return "good";
    if (score >= 55) return "warn";
    return "bad";
}

// What to show for parcels that are no longer on their way
function closedState(rec) {

    const phase = parcelPhase(rec);

    if (phase === "delivered") {
        return { tone: "good", band: "Delivered", score: 100,
            verdict: "This parcel was delivered successfully.",
            why: "Nothing more to do for this parcel." };
    }

    if (phase === "hold") {
        return { tone: "bad", band: "Damaged", score: null,
            verdict: "Damage is recorded for this parcel.",
            why: "Submit a damage report so it can be resolved." };
    }

    return { tone: "warn", band: "Cancelled", score: null,
        verdict: "This parcel was cancelled.",
        why: "Follow the refund steps in Cancellation & Refund." };
}

// Saves a change made by a "Fix it" button, then redraws the page
function commitFix(rec, icon, title, text, toast) {

    logAction(rec, icon, title, text);

    if (saveParcels()) {
        notify(title, toast || text, "success");
        renderAll();
    }
}

function suggestActions(rec, p, u, result) {

    const actions = [];

    if (!result.inWindow && rec.rescheduleCount < 3) {

        const slot = Math.min(u.availableTo, u.availableFrom + 1);

        actions.push({
            text: "Move delivery to " + fmtHour(slot) + ", when you are home",
            button: "Reschedule",
            run: function() {
                rec.slotHour = slot;
                rec.slotLabel = fmtHour(slot) + " – " + fmtHour(slot + 2);
                rec.availabilityConfirmed = false;
                rec.rescheduleCount++;
                commitFix(rec, "🕒", "Delivery rescheduled", "New slot: " + rec.slotLabel);
            }
        });
    }

    if (u.safeType === "me") {

        actions.push({
            text: "Add a verified way for someone else to receive it",
            button: "Set up",
            run: function() { openSafeDelivery(); }
        });
    }

    if (rec.hardAddress && !rec.pickupPoint) {

        actions.push({
            text: "Collect from a nearby pickup point instead",
            button: "Switch",
            run: function() {
                rec.pickupPoint = true;
                commitFix(rec, "📍", "Pickup point selected", "You will collect " + rec.id + " from a pickup point.");
            }
        });
    }

    if (p.cod) {

        actions.push({
            text: "Pay online now so no cash is needed at the door",
            button: "Pay online",
            run: function() {
                rec.payment = "Prepaid";
                commitFix(rec, "💳", "Paid online", "Cash on delivery removed for " + rec.id + ".");
            }
        });
    }

    if (!rec.availabilityConfirmed && result.inWindow) {

        actions.push({
            text: "Confirm that you will be home for this delivery",
            button: "I'll be home",
            run: function() {
                rec.availabilityConfirmed = true;
                commitFix(rec, "✓", "Availability confirmed", "You will be home for the delivery.");
            }
        });
    }

    return actions;
}

function ecoImpact(rec) {

    const total = ECO_MODES[rec.mode].g * rec.distanceKm;
    const standard = ECO_MODES.standard.g * rec.distanceKm;
    const saved = standard - total;

    return { grams: total, saved: saved, pct: Math.round(Math.abs(saved) / standard * 100) };
}

function kg(grams) {
    return (grams / 1000).toFixed(1);
}

function renderConfidence() {

    const rec = currentParcelId ? getParcel(currentParcelId) : null;

    if (!rec) return;

    // parcel drop-down in the section header
    const select = $("confidenceParcel");

    select.innerHTML = myParcels().map(function(p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.id) + " - " + esc(p.name) + "</option>";
    }).join("");
    select.value = rec.id;

    const u = userInput();
    const card = document.querySelector(".confidence-score-card");
    const arc = $("scoreArc");
    const factorsEl = $("scoreFactors");
    const actionsEl = $("scoreActions");
    const actionsBox = document.querySelector(".confidence-actions");

    factorsEl.innerHTML = "";
    actionsEl.innerHTML = "";

    // a different parcel: restart the ring so it animates in
    if (confShownFor !== rec.id) {
        lastShownScore = 0;
        arc.style.strokeDashoffset = "402.12";
        void arc.getBoundingClientRect();
        confShownFor = rec.id;
    }

    // ----- parcels that are no longer being delivered -----
    if (parcelPhase(rec) !== "active") {

        const closed = closedState(rec);

        card.classList.remove("good", "warn", "bad");
        card.classList.add(closed.tone);

        if (closed.score === null) {
            $("scoreValue").textContent = "–";
            arc.style.strokeDashoffset = 402.12;
            lastShownScore = 0;
        } else {
            animateNumber($("scoreValue"), closed.score);
            arc.style.strokeDashoffset = 402.12 * (1 - closed.score / 100);
            lastShownScore = closed.score;
        }

        $("scoreBand").textContent = closed.band;
        $("scoreVerdict").textContent = closed.verdict;
        $("scoreWhy").textContent = closed.why;

        factorsEl.innerHTML = '<li><span class="empty-note">No delivery risks to calculate for this parcel.</span></li>';
        actionsEl.innerHTML = '<p class="empty-note">No action needed here.</p>';
        actionsBox.classList.add("safe");

        renderEco(rec, false);
        return;
    }

    // ----- active parcels -----
    const p = engineInput(rec);
    const result = calculateDeliveryScore(p, u);
    const t = scoreBand(result.score);

    card.classList.remove("good", "warn", "bad");
    card.classList.add(t);

    arc.style.strokeDashoffset = 402.12 * (1 - result.score / 100);

    const numberEl = $("scoreValue");
    numberEl.textContent = lastShownScore;
    animateNumber(numberEl, result.score);
    lastShownScore = result.score;

    $("scoreBand").textContent = t === "good" ? "Likely" : t === "warn" ? "At risk" : "High risk";

    $("scoreVerdict").textContent =
        t === "good" ? "This delivery should go smoothly."
        : t === "warn" ? "There is a real chance this delivery fails."
        : "This delivery will probably fail unless you act.";

    const worst = result.factors
        .filter(function(f) { return f.points < 0; })
        .sort(function(a, b) { return a.points - b.points; })[0];

    $("scoreWhy").textContent = worst ? "Biggest risk: " + worst.note : "No major risks found.";

    // the reasons
    if (result.factors.length === 0) {

        factorsEl.innerHTML = '<li><span class="empty-note">Nothing is lowering this score.</span></li>';

    } else {

        result.factors.forEach(function(f, index) {

            const li = document.createElement("li");
            li.style.setProperty("--i", index);

            li.innerHTML =
                '<div class="factor-text"><strong>' + esc(f.label) + "</strong><small>" + esc(f.note) + "</small></div>" +
                '<span class="factor-points ' + (f.points < 0 ? "neg" : "pos") + '">' +
                (f.points > 0 ? "+" : "") + f.points + "</span>";

            factorsEl.appendChild(li);
        });
    }

    // fixes
    const actions = result.score < 85 ? suggestActions(rec, p, u, result) : [];

    actionsBox.classList.toggle("safe", actions.length === 0);

    if (actions.length === 0) {

        actionsEl.innerHTML = '<p class="empty-note">' +
            (result.score >= 85 ? "No action needed. This delivery looks safe." : "No further actions available.") + "</p>";

    } else {

        actions.forEach(function(a, index) {

            const row = document.createElement("div");
            row.className = "score-action";
            row.style.setProperty("--i", index);

            const label = document.createElement("span");
            label.textContent = a.text;

            const btn = document.createElement("button");
            btn.className = "action-btn";
            btn.textContent = a.button;
            btn.addEventListener("click", a.run);

            row.appendChild(label);
            row.appendChild(btn);
            actionsEl.appendChild(row);
        });
    }

    renderEco(rec, true);
}

function renderEco(rec, enabled) {

    const modesEl = $("ecoModes");
    const resultEl = $("ecoResult");

    modesEl.innerHTML = "";

    Object.keys(ECO_MODES).forEach(function(key) {

        const m = ECO_MODES[key];

        const btn = document.createElement("button");
        btn.className = "eco-mode";
        btn.setAttribute("aria-pressed", String(rec.mode === key));
        btn.disabled = !enabled;

        btn.innerHTML = "<strong>" + m.name + "</strong><span>" + m.days + "</span><small>" + m.info + "</small>";

        btn.addEventListener("click", function() {

            if (rec.mode === key) return;

            rec.mode = key;
            logAction(rec, "🌱", "Delivery mode: " + m.name, m.days + " · " + m.info);

            if (!saveParcels()) return;

            if (key === "eco") {
                notify("Eco delivery selected",
                    "You save about " + kg(ecoImpact(rec).saved) + " kg of CO₂ on this parcel.", "success");
            } else {
                notify(m.name + " delivery selected", m.days + " · " + m.info, "info", 3000);
            }

            renderAll();
        });

        modesEl.appendChild(btn);
    });

    const e = ecoImpact(rec);
    const stdG = ECO_MODES.standard.g * rec.distanceKm;
    const ecoG = ECO_MODES.eco.g * rec.distanceKm;

    $("ecoMath").innerHTML =
        "<p>CO₂ = grams per km × distance. We use average values per parcel: " +
        "Express " + ECO_MODES.express.g + " g, Standard " + ECO_MODES.standard.g +
        " g, Eco " + ECO_MODES.eco.g + " g per km.</p>" +
        "<p>This parcel travels <b>" + rec.distanceKm + " km</b> (the distance you entered):</p>" +
        "<ul>" +
        "<li>Standard: " + ECO_MODES.standard.g + " × " + rec.distanceKm + " = <b>" + kg(stdG) + " kg</b></li>" +
        "<li>Eco: " + ECO_MODES.eco.g + " × " + rec.distanceKm + " = <b>" + kg(ecoG) + " kg</b></li>" +
        "<li>Saved: " + kg(stdG) + " − " + kg(ecoG) + " = <b>" + kg(stdG - ecoG) + " kg</b>, which is <b>" +
        Math.round((stdG - ecoG) / stdG * 100) + "%</b> less than Standard</li>" +
        "</ul>" +
        "<p>Why Eco is lower: one vehicle carries many parcels on the same trip, so each parcel gets only a small share of the fuel. " +
        "The trade-off is a slower delivery (3–4 days) and a fixed time slot.</p>";

    if (!enabled) {

        resultEl.innerHTML = parcelPhase(rec) === "delivered"
            ? "🌱 This parcel produced about <b>" + kg(e.grams) + " kg CO₂</b>. Delivery mode can no longer be changed."
            : "Delivery mode can't be changed for this parcel.";

    } else if (rec.mode === "eco") {

        resultEl.innerHTML =
            "🌱 <b>" + kg(e.grams) + " kg CO₂</b> for this parcel. You save about <b>" +
            kg(e.saved) + " kg</b> (" + e.pct + "% less than Standard).";

    } else if (rec.mode === "standard") {

        const ecoSaving = (ECO_MODES.standard.g - ECO_MODES.eco.g) * rec.distanceKm;

        resultEl.innerHTML =
            "<b>" + kg(e.grams) + " kg CO₂</b> for this parcel. Switch to Eco to save about <b>" +
            kg(ecoSaving) + " kg</b>. Delivery takes longer and the time slot is fixed.";

    } else {

        resultEl.innerHTML =
            "<b>" + kg(e.grams) + " kg CO₂</b> for this parcel, about " + e.pct +
            "% more than Standard. Faster, but heavier on the environment.";
    }
}

// Called by the drop-down in the Delivery Confidence heading
function updateConfidence(id) {

    if (getParcel(id)) openParcel(id, { scroll: false });
}


/* =========================================================
   7. INTERACTIONS AND ANIMATION
   ========================================================= */

function initInteractions() {

    document.documentElement.classList.add("js");

    // Ripple effect on buttons and parcel cards
    document.addEventListener("click", function(event) {

        const target = event.target.closest("button, .parcel-card");

        if (!target || target.disabled || reduceMotion) return;

        const rect = target.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);

        const ripple = document.createElement("span");
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
        ripple.style.top = (event.clientY - rect.top - size / 2) + "px";

        target.appendChild(ripple);
        setTimeout(function() { ripple.remove(); }, 650);
    });

    // Modals: accessible dialogs, close by background click, Esc, and keep Tab inside
    document.querySelectorAll(".modal").forEach(function(modal) {

        const box = modal.querySelector(".modal-content");
        const heading = modal.querySelector("h2");

        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");

        if (heading) {
            heading.id = heading.id || modal.id + "Title";
            box.setAttribute("aria-labelledby", heading.id);
        }

        modal.addEventListener("click", function(event) {
            if (event.target === modal) closeModal(modal.id);
        });
    });

    document.addEventListener("keydown", function(event) {

        const open = document.querySelector(".modal.show");

        if (!open) return;

        if (event.key === "Escape") {
            closeModal(open.id);
            return;
        }

        if (event.key === "Tab") {

            const items = Array.prototype.slice.call(open.querySelectorAll(
                "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]"
            )).filter(function(el) { return el.offsetParent !== null; });

            if (items.length === 0) return;

            const first = items[0];
            const last = items[items.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    // Sections fade up as they scroll into view
    if ("IntersectionObserver" in window) {

        const targets = document.querySelectorAll(
            ".search-section, .stat-card, .my-parcels-section, .activity-section, .action-card, " +
            ".help-assistant, .prevention-section, .settings-section, .support-section"
        );

        const observer = new IntersectionObserver(function(entries) {

            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in");
                    observer.unobserve(entry.target);
                }
            });

        }, { threshold: 0.1 });

        targets.forEach(function(el) {

            if (el.matches(".stat-card, .action-card")) {
                const index = Array.prototype.indexOf.call(el.parentNode.children, el);
                el.style.setProperty("--d", (index * 0.08) + "s");
            }

            el.classList.add("reveal");
            observer.observe(el);
        });
    }

    // Navbar shadow + highlight of the current section
    const navbar = document.querySelector(".navbar");
    const links = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));

    function onScroll() {

        navbar.classList.toggle("scrolled", window.scrollY > 10);

        let current = "";
        let bestTop = -Infinity;

        links.forEach(function(link) {

            const section = document.querySelector(link.getAttribute("href"));

            if (!section || section.offsetParent === null) return;

            const top = section.getBoundingClientRect().top;

            if (top <= 140 && top > bestTop) {
                bestTop = top;
                current = link.getAttribute("href");
            }
        });

        links.forEach(function(link) {
            link.classList.toggle("active", link.getAttribute("href") === current);
        });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
}

// Cards tilt towards the mouse and a soft light follows the cursor
function initTilt() {

    if (reduceMotion || !window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;

    document.querySelectorAll(".stat-card, .action-card").forEach(function(card) {

        card.classList.add("tilt");

        card.addEventListener("mousemove", function(event) {

            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            card.style.setProperty("--mx", x + "px");
            card.style.setProperty("--my", y + "px");
            card.style.setProperty("--ry", ((x / rect.width - 0.5) * 12) + "deg");
            card.style.setProperty("--rx", ((0.5 - y / rect.height) * 12) + "deg");
        });

        card.addEventListener("mouseleave", function() {
            card.style.setProperty("--rx", "0deg");
            card.style.setProperty("--ry", "0deg");
        });
    });
}


/* =========================================================
   8. START-UP
   ========================================================= */

function init() {

    loadDB();

    initAuth();
    initSettingsControls();
    initInteractions();
    initTilt();

    $("addParcelForm").addEventListener("submit", handleAddParcel);
    $("checkpointForm").addEventListener("submit", handleCheckpoint);

    $("bookingFilter").addEventListener("input", renderParcelList);

    // keep the logged-in user after a refresh (but not after the browser is closed)
    const session = readSession();

    if (session && db.users[session.username]) {
        currentUser = db.users[session.username];
        authRole = currentUser.role;
        showAppView();
    } else {
        showAuthView();
    }

    if (corruptedKeys.length) {
        notify("Some saved data was unreadable",
            "It was reset so the app could start. A backup copy was kept in your browser.", "warning", 8000);
    }
}

init();