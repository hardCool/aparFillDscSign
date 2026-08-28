// ==UserScript==
// @name         parFillDraftSave
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Auto Fill, Save Draft & Loop Automation with Hotkeys (1: Start, 2: Stop)
// @author       Hardev Singh
// @match        *://sparrowdelhipolice.saccess.nic.in/*
// @match        *://sparrow2delhipolice.saccess.nic.in/*
// @match        *://*.saccess.nic.in/*
// @match        *://*.nic.in/*
// @run-at       document-idle
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/hardCool/aparFillDscSign/main/parFillDraftSave.js
// @downloadURL  https://raw.githubusercontent.com/hardCool/aparFillDscSign/main/parFillDraftSave.js
// ==/UserScript==

(function () {

'use strict';

/************************************************
 * CONFIGURATION & STATE
 ************************************************/

const CONFIG = {

    PLACE: "New Delhi",

    // Auto-fill and Save as Draft settings
    AUTO_SAVE_DRAFT: true,

    // Navigation flow settings
    AUTO_GOTO_INBOX: true,
    AUTO_CLICK_ASSESS_PAR: true,

    // Queue Loop: Automatically open the next unsaved APAR from the list
    AUTO_OPEN_NEXT: true,
    SKIP_DRAFTED: true, // Set to true to skip rows already showing the "Drafted" icon

    // Delay timers (in milliseconds)
    SAVE_DELAY_MS: 1200,
    NEXT_OPEN_DELAY_MS: 1000,

    PEN_PICTURE_MALE: [
        "The officer has performed his assigned duties diligently and efficiently. He has displayed sincerity, commitment and professionalism while discharging his responsibilities. His overall conduct and performance have been commendable.",
        "The officer has discharged his duties with dedication and responsibility. He has maintained discipline, demonstrated a positive attitude towards work and completed assigned tasks efficiently.",
        "The officer has carried out assigned responsibilities sincerely and efficiently. He has shown commitment, integrity and a cooperative approach while performing official duties. His performance has been satisfactory.",
        "The officer has performed his duties with sincerity and devotion. He has demonstrated professionalism, punctuality and a responsible approach towards assigned work. His overall performance has been commendable.",
        "The officer has displayed dedication, discipline and a positive work attitude throughout the assessment period. He has completed assigned responsibilities efficiently and maintained good professional conduct.",
        "The officer has discharged his responsibilities efficiently and with due diligence. He has shown initiative, commitment and integrity in the performance of official duties. His conduct has been satisfactory."
    ],

    PEN_PICTURE_FEMALE: [
        "The officer has performed her assigned duties diligently and efficiently. She has displayed sincerity, commitment and professionalism while discharging her responsibilities. Her overall conduct and performance have been commendable.",
        "The officer has discharged her duties with dedication and responsibility. She has maintained discipline, demonstrated a positive attitude towards work and completed assigned tasks efficiently.",
        "The officer has carried out assigned responsibilities sincerely and efficiently. She has shown commitment, integrity and a cooperative approach while performing official duties. Her performance has been satisfactory.",
        "The officer has performed her duties with sincerity and devotion. She has demonstrated professionalism, punctuality and a responsible approach towards assigned work. Her overall performance has been commendable.",
        "The officer has displayed dedication, discipline and a positive work attitude throughout the assessment period. She has completed assigned responsibilities efficiently and maintained good professional conduct.",
        "The officer has discharged her responsibilities efficiently and with due diligence. She has shown initiative, commitment and integrity in the performance of official duties. Her conduct has been satisfactory."
    ]
};

// Reset execution flags on load
window.__SPARROW_OPENING_NEXT__ = false;
window.__SPARROW_CLICKED__ = false;
window.__SPARROW_NEXT_TIMEOUT__ = null;

function isAutoRunEnabled() {
    return sessionStorage.getItem("SPARROW_AUTO_RUN") !== "false";
}

function setAutoRun(enabled) {
    sessionStorage.setItem("SPARROW_AUTO_RUN", enabled ? "true" : "false");
    console.log(`SPARROW Assistant: Auto-run status set to [${enabled ? "ENABLED" : "STOPPED"}]`);
    updateRunStatus(enabled ? "RUNNING - Press 2 to stop" : "STOPPED - Press 1 to start", enabled);
}

function updateRunStatus(message, isRunning) {
    let status = document.getElementById("sparrow-run-status");
    if (!status && document.body) {
        status = document.createElement("div");
        status.id = "sparrow-run-status";
        status.style.cssText = "position:fixed;top:10px;right:10px;z-index:2147483647;padding:8px 12px;border:2px solid;font:600 13px Arial,sans-serif;background:#fff;color:#222;";
        document.body.appendChild(status);
    }
    if (status) {
        status.textContent = message;
        status.style.borderColor = isRunning ? "#198754" : "#dc3545";
    }
}

/************************************************
 * KEYBOARD SHORTCUTS (1 = START, 2 = STOP)
 ************************************************/

window.addEventListener("keydown", function (e) {
    // Ignore key presses inside text inputs or textareas
    const activeElement = document.activeElement;
    if (activeElement && ["INPUT", "TEXTAREA"].includes(activeElement.tagName)) return;

    if (e.key === "1") {
        e.preventDefault();
        console.log("SPARROW Assistant: Hotkey '1' pressed -> STARTING script execution...");
        setAutoRun(true);
        startPoller();
    } else if (e.key === "2") {
        e.preventDefault();
        console.log("SPARROW Assistant: Hotkey '2' pressed -> STOPPING script execution...");
        setAutoRun(false);
        stopPoller();
        if (window.__SPARROW_NEXT_TIMEOUT__) {
            clearTimeout(window.__SPARROW_NEXT_TIMEOUT__);
        }
    }
});

/************************************************
 * STATE HELPERS
 ************************************************/

function isPendingInboxNavigation() {
    return sessionStorage.getItem("SPARROW_NAVIGATE_INBOX") === "true";
}

function markDraftSubmitted() {
    if (CONFIG.AUTO_GOTO_INBOX) {
        sessionStorage.setItem("SPARROW_NAVIGATE_INBOX", "true");
        sessionStorage.setItem("SPARROW_CLICK_ASSESS_PAR", "true");
    }
}

/************************************************
 * AUTOMATED QUEUE: OPEN NEXT PENDING APAR
 ************************************************/

function openNextPendingAPAR() {
    if (!CONFIG.AUTO_OPEN_NEXT || !isAutoRunEnabled()) return false;
    if (window.__SPARROW_OPENING_NEXT__) return false;

    const rows = document.querySelectorAll("#dataGrid tbody tr, #dataGridForStage tbody tr");
    if (!rows || rows.length === 0) return false;

    if (rows.length === 1 && rows[0].textContent.toLowerCase().includes("loading")) {
        return false;
    }

    let targetLink = null;

    for (let row of rows) {
        if (CONFIG.SKIP_DRAFTED) {
            const isDrafted = row.querySelector("img[src*='draft.png']") ||
                              row.querySelector("img[title*='Drafted']") ||
                              row.textContent.includes("Drafted");
            if (isDrafted) continue;
        }

        const link = row.querySelector("a[onclick*='doInboxRedirect']") || row.querySelector("td a");
        if (link) {
            targetLink = link;
            break;
        }
    }

    if (targetLink) {
        window.__SPARROW_OPENING_NEXT__ = true;
        console.log("SPARROW Assistant: Target pending APAR found:", targetLink.innerText || targetLink);

        window.__SPARROW_NEXT_TIMEOUT__ = setTimeout(() => {
            if (!isAutoRunEnabled()) {
                window.__SPARROW_OPENING_NEXT__ = false;
                return;
            }
            try {
                targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetLink.click();
            } catch (e) {
                console.error("SPARROW Assistant: Failed to click APAR link", e);
                window.__SPARROW_OPENING_NEXT__ = false;
            }
        }, CONFIG.NEXT_OPEN_DELAY_MS);

        return true;
    } else {
        console.log("SPARROW Assistant: No remaining unsaved APARs found in current view.");
        return false;
    }
}

function startInboxTableObserver() {
    let attempts = 0;
    const maxAttempts = 30;

    const inboxInterval = setInterval(() => {
        attempts++;
        if (!isAutoRunEnabled()) {
            clearInterval(inboxInterval);
            return;
        }
        const opened = openNextPendingAPAR();

        if (opened || attempts >= maxAttempts) {
            clearInterval(inboxInterval);
        }
    }, 600);
}

/************************************************
 * AUTO NAVIGATE TO INBOX & ASSESS PAR
 ************************************************/

function tryClickInbox() {
    if (!isPendingInboxNavigation() || !isAutoRunEnabled()) return false;

    console.log("SPARROW Assistant: Post-save state detected. Searching for Inbox link...");

    let attempts = 0;
    const inboxInterval = setInterval(() => {
        attempts++;
        if (!isAutoRunEnabled()) {
            clearInterval(inboxInterval);
            return;
        }

        let inboxBtn = document.querySelector('a[href*="inbox/doShow"]') || document.querySelector('a[href="inbox/doShow"]');

        if (!inboxBtn) {
            const anchors = document.querySelectorAll("a");
            for (let a of anchors) {
                if ((a.getAttribute("href") || "").includes("doShow") || a.innerText.toLowerCase().includes("inbox")) {
                    inboxBtn = a;
                    break;
                }
            }
        }

        if (inboxBtn) {
            clearInterval(inboxInterval);
            sessionStorage.removeItem("SPARROW_NAVIGATE_INBOX");
            console.log("SPARROW Assistant: Found Inbox link. Navigating...", inboxBtn);

            try {
                inboxBtn.click();
                setTimeout(() => {
                    if (inboxBtn.href) window.location.href = inboxBtn.href;
                }, 200);
            } catch(e) {
                if (inboxBtn.href) window.location.href = inboxBtn.href;
            }
        } else if (attempts >= 15) {
            clearInterval(inboxInterval);
            sessionStorage.removeItem("SPARROW_NAVIGATE_INBOX");
            console.warn("SPARROW Assistant: Inbox link not found in DOM.");
        }
    }, 300);

    return true;
}

function tryClickAssessPAR() {
    if (!CONFIG.AUTO_CLICK_ASSESS_PAR || !isAutoRunEnabled()) return false;

    let assessTab = document.getElementById("tabID1");
    let isInboxPage = document.getElementById("assessCountId") || document.getElementById("dataGrid") || document.getElementById("dataGridForStage");

    if (assessTab && isInboxPage) {
        const needsClick = sessionStorage.getItem("SPARROW_CLICK_ASSESS_PAR") === "true";

        if (needsClick || !assessTab.classList.contains("TabbedPanelsTabSelected")) {
            sessionStorage.removeItem("SPARROW_CLICK_ASSESS_PAR");
            console.log("SPARROW Assistant: Switching to 'Assess PAR' tab...", assessTab);

            try {
                assessTab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
                assessTab.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
                assessTab.click();

                if (typeof window.showInboxData === "function") {
                    window.showInboxData('assessParDivID', 'A');
                }
            } catch (e) {
                console.error("SPARROW Assistant: Error clicking Assess PAR tab", e);
            }
        }

        startInboxTableObserver();
        return true;
    }

    return false;
}

/************************************************
 * COMMON FUNCTIONS
 ************************************************/

function fireEvents(el){
    if(!el) return;
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
}

function fixEditable(id){
    let el = document.getElementById(id);
    if(!el) return null;
    el.removeAttribute("readonly");
    el.readOnly = false;
    el.disabled = false;
    return el;
}

/************************************************
 * CLICK SAVE AS DRAFT
 ************************************************/

function clickSaveAsDraft() {
    if (!CONFIG.AUTO_SAVE_DRAFT || !isAutoRunEnabled()) return;
    if (window.__SPARROW_CLICKED__) return;
    window.__SPARROW_CLICKED__ = true;

    setTimeout(() => {
        if (!isAutoRunEnabled()) return;

        let draftBtn = document.getElementById("draft");

        if (!draftBtn) {
            const possibleIds = ["saveAsDraft", "saveDraft", "btnSaveDraft", "btnSaveAsDraft"];
            for (let id of possibleIds) {
                let el = document.getElementById(id);
                if (el) { draftBtn = el; break; }
            }
        }

        if (!draftBtn) {
            const candidates = document.querySelectorAll("input[type='submit'], input[type='button'], button");
            for (let el of candidates) {
                const text = (el.value || el.textContent || "").toLowerCase().trim();
                if (text.includes("save as draft") || text.includes("save draft")) {
                    draftBtn = el;
                    break;
                }
            }
        }

        if (draftBtn) {
            markDraftSubmitted();
            console.log("SPARROW Assistant: Executing 'Save As Draft' submission...", draftBtn);

            draftBtn.disabled = false;
            draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                if (!isAutoRunEnabled()) return;
                if (draftBtn.form && typeof draftBtn.form.requestSubmit === "function") {
                    try {
                        draftBtn.form.requestSubmit(draftBtn);
                        return;
                    } catch (e) {
                        console.warn("SPARROW Assistant: requestSubmit failed, executing fallbacks.", e);
                    }
                }

                try {
                    draftBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
                    draftBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
                    draftBtn.click();
                } catch(err) {
                    console.error("SPARROW Assistant: Direct click failed", err);
                }
            }, 300);
        } else {
            console.warn("SPARROW Assistant: 'Save As Draft' button not found.");
        }
    }, CONFIG.SAVE_DELAY_MS);
}

/************************************************
 * GET ASSESSMENT PERIOD
 ************************************************/

function getAssessmentPeriod(){
    let period = { from: "", to: "" };

    document.querySelectorAll("div.lbl-bold").forEach(function(el){
        if(el.textContent.trim() === "Assessment Period:"){
            let next = el.nextElementSibling;
            if(!next) return;
            let txt = next.textContent.trim();
            let m = txt.match(/(\d{2}\/\d{2}\/\d{4})\s*to\s*(\d{2}\/\d{2}\/\d{4})/);
            if(m){
                period.from = m[1];
                period.to = m[2];
            }
        }
    });

    return period;
}

function isFemaleOfficer() {
    const cadre = (document.getElementById("cadreId")?.value || "").toUpperCase();
    return cadre.includes("WOMEN");
}

function getRandomPenPicture() {
    const remarks = isFemaleOfficer()
        ? CONFIG.PEN_PICTURE_FEMALE
        : CONFIG.PEN_PICTURE_MALE;
    return remarks[Math.floor(Math.random() * remarks.length)];
}

/************************************************
 * REVIEWING AUTHORITY
 ************************************************/

function fillReview(){
    if (!isAutoRunEnabled()) return;
    console.log("Reviewing Authority Form Detected");

    let period = getAssessmentPeriod();

    let from1 = fixEditable("disableddatePickerRevOfficerFromID");
    let to1   = fixEditable("disableddatePickerRevOfficerToID");

    let from2 = fixEditable("datePickerduringFrom");
    let to2   = fixEditable("datePickerduringTo");

    if(from1 && period.from){
        from1.value = period.from;
        fireEvents(from1);
    }

    if(to1 && period.to){
        to1.value = period.to;
        fireEvents(to1);
    }

    if(from2 && from1){
        from2.value = from1.value;
        fireEvents(from2);
    }

    if(to2 && to1){
        to2.value = to1.value;
        fireEvents(to2);
    }

    let agree = document.getElementById("agreeReportingOfficerAssessmentYES");
    if(agree && !agree.checked){
        agree.checked = true;
        agree.dispatchEvent(new Event("click",{bubbles:true}));
        agree.dispatchEvent(new Event("change",{bubbles:true}));
    }

    let opinion = document.getElementById("differenceOfOpinionDetail");
    if(opinion && opinion.value.trim() === ""){
        opinion.value = "N/A";
        fireEvents(opinion);
    }

    let pen = document.getElementById("appPenPictureByReviewOfficer");
    if(pen && pen.value.trim() === ""){
        pen.value = getRandomPenPicture();
        fireEvents(pen);
    }

    let place = document.getElementById("revPlaceId");
    if(place && place.value.trim() === ""){
        place.value = CONFIG.PLACE;
        fireEvents(place);
    }

    console.log("Reviewing APAR Auto-Fill Completed");

    clickSaveAsDraft();
}

/************************************************
 * ACCEPTING AUTHORITY
 ************************************************/

function fillAccept(){
    if (!isAutoRunEnabled()) return;
    console.log("Accepting Authority Form Detected");

    let period = getAssessmentPeriod();

    let from = fixEditable("disableddatePickerAccduringFrom");
    let to   = fixEditable("disableddatePickerAccduringTo");

    if(from && period.from){
        from.value = period.from;
        fireEvents(from);
    }

    if(to && period.to){
        to.value = period.to;
        fireEvents(to);
    }

    let agree = document.getElementById("agreeRemarksReportingReviewingYES");
    if(agree && !agree.checked){
        agree.checked = true;
        agree.dispatchEvent(new MouseEvent("click",{bubbles:true}));
        agree.dispatchEvent(new Event("change",{bubbles:true}));
    }

    let comments = document.getElementById("commentsOfAccpOfficer");
    if (comments && comments.value.trim() === "") {
        comments.value = "N/A";
        fireEvents(comments);
    }

    let reviewGradeField = document.getElementById("reviewInformationGradeID");
    let acceptGradeField = fixEditable("acceptanceInformationGradeID");

    if(reviewGradeField && acceptGradeField){
        let reviewGrade = parseFloat(reviewGradeField.value);
        if(!isNaN(reviewGrade)){
            let rounded = Math.round(reviewGrade * 2) / 2;
            acceptGradeField.value = rounded;
            fireEvents(acceptGradeField);
            console.log("Review Grade:", reviewGrade, "Accepted:", rounded);
        }
    }

    let place = fixEditable("accPlaceId");
    if(place && place.value.trim() === ""){
        place.value = CONFIG.PLACE;
        fireEvents(place);
    }

    console.log("Accepting APAR Auto-Fill Completed");

    clickSaveAsDraft();
}

/************************************************
 * SWITCH FORM TAB IF DEFAULTED TO SELF APPRAISAL
 ************************************************/

function trySwitchToAssessmentTab() {
    if (!isAutoRunEnabled()) return false;

    const reviewTab = document.getElementById("tabID3") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("REVIEW"));
    const acceptTab = document.getElementById("tabID4") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("ACCEPT"));

    if (reviewTab && !reviewTab.classList.contains("TabbedPanelsTabSelected")) {
        console.log("SPARROW Assistant: Navigating to Reviewing Authority Tab...", reviewTab);
        reviewTab.click();
        return true;
    } else if (acceptTab && !acceptTab.classList.contains("TabbedPanelsTabSelected")) {
        console.log("SPARROW Assistant: Navigating to Accepting Authority Tab...", acceptTab);
        acceptTab.click();
        return true;
    }

    return false;
}

/************************************************
 * MAIN CONTROLLER
 ************************************************/

function detectAuthority(){
    if (!isAutoRunEnabled()) return false;

    // 1. Post-save navigation handlers (Inbox)
    if (tryClickInbox()) return true;
    if (tryClickAssessPAR()) return true;

    // 2. Form Auto-Fill handlers
    const activeTab = document.querySelector(".TabbedPanelsTabSelected");

    if(!activeTab){
        if (document.getElementById("appPenPictureByReviewOfficer")) {
            fillReview();
            return true;
        } else if (document.getElementById("commentsOfAccpOfficer") || document.getElementById("acceptanceInformationGradeID")) {
            fillAccept();
            return true;
        }
        return false;
    }

    console.log("Active Tab :", activeTab.id);

    const tabText = activeTab.textContent.toUpperCase();

    if (activeTab.id === "tabID3" || tabText.includes("REVIEW")) {
        fillReview();
        return true;
    } else if (activeTab.id === "tabID4" || tabText.includes("ACCEPT")) {
        fillAccept();
        return true;
    } else {
        if (trySwitchToAssessmentTab()) {
            setTimeout(detectAuthority, 500);
            return true;
        }
    }

    return false;
}

/************************************************
 * RETRY INITIALIZATION (Poller)
 ************************************************/

function startPoller() {
    if (!isAutoRunEnabled()) return;

    stopPoller();

    let attempts = 0;
    const maxAttempts = 20;

    window.__SPARROW_POLLER__ = setInterval(() => {
        attempts++;
        if (!isAutoRunEnabled()) {
            stopPoller();
            return;
        }
        const success = detectAuthority();

        if (success || attempts >= maxAttempts) {
            stopPoller();
        }
    }, 500);
}

function stopPoller() {
    if (window.__SPARROW_POLLER__) {
        clearInterval(window.__SPARROW_POLLER__);
        window.__SPARROW_POLLER__ = null;
    }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    updateRunStatus(isAutoRunEnabled() ? "RUNNING - Press 2 to stop" : "STOPPED - Press 1 to start", isAutoRunEnabled());
    startPoller();
} else {
    window.addEventListener("DOMContentLoaded", startPoller);
}

})();