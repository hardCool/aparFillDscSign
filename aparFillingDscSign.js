// ==UserScript==
// @name         aparFillingDscSign
// @namespace    http://tampermonkey.net/
// @version      19.7-DP-AUTODSC-FIXED
// @author       hardCool
// @description  SPARROW APAR filling and DSC signing assistant
// @match        *://sparrowdelhipolice.saccess.nic.in/*
// @match        *://sparrow2delhipolice.saccess.nic.in/*
// @match        *://*.saccess.nic.in/*
// @run-at       document-start
// @allFrames    true
// @grant        none
//
// @updateURL    https://raw.githubusercontent.com/hardCool/aparFillDscSign/main/aparFillingDscSign.js
// @downloadURL  https://raw.githubusercontent.com/hardCool/aparFillDscSign/main/aparFillingDscSign.js
// ==/UserScript==


(function () {
    'use strict';

    /************************************************
     * BULLETPROOF NATIVE POPUP & ALERT INTERCEPTOR
     ************************************************/
    function lockNativeAlerts(targetWindow) {
        try {
            if (!targetWindow || targetWindow.__sparrow_native_locked) return;

            const noop = function (message) {
                console.log(`[SPARROW POPUP BYPASS] Suppressed alert/confirm: "${message}"`);
                return true;
            };

            const promptNoop = function (message, defaultValue) {
                console.log(`[SPARROW POPUP BYPASS] Suppressed prompt: "${message}"`);
                return defaultValue || "";
            };

            // Lock properties to prevent SPARROW/DSC scripts from re-binding alert
            try {
                Object.defineProperty(targetWindow, 'alert', {
                    get: () => noop,
                    set: () => {},
                    configurable: true
                });
                Object.defineProperty(targetWindow, 'confirm', {
                    get: () => noop,
                    set: () => {},
                    configurable: true
                });
                Object.defineProperty(targetWindow, 'prompt', {
                    get: () => promptNoop,
                    set: () => {},
                    configurable: true
                });
            } catch (e) {
                targetWindow.alert = noop;
                targetWindow.confirm = noop;
                targetWindow.prompt = promptNoop;
            }

            targetWindow.__sparrow_native_locked = true;
        } catch (e) {
            // Cross-origin boundary fallback
        }
    }

    // Apply to top, parent, and current window immediately
    lockNativeAlerts(window);
    try { lockNativeAlerts(window.top); } catch (e) {}
    try { lockNativeAlerts(window.parent); } catch (e) {}

    // Hook newly injected iframes
    const iframeObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.tagName === 'IFRAME') {
                    try {
                        lockNativeAlerts(node.contentWindow);
                    } catch (e) {}
                }
            }
        }
    });

    function observeIframes() {
        if (document.documentElement) {
            iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    observeIframes();
    window.addEventListener("DOMContentLoaded", observeIframes, { once: true });

    // Continuous scanner to click non-native/HTML modal OK buttons
    setInterval(() => {
        if (!isAutoRunning()) return;

        scanForModalButtons(document);
    }, 200);

    function scanForModalButtons(currentDocument) {
        const modalOkBtns = Array.from(currentDocument.querySelectorAll('button, input[type="button"], input[type="submit"], a, div[role="button"]')).filter(el => {
            const txt = (el.value || el.innerText || '').trim().toUpperCase();
            return (txt === 'OK' || txt === 'ACCEPT' || txt === 'CONTINUE' || txt === 'CLOSE') && el.offsetWidth > 0 && el.offsetHeight > 0;
        });

        modalOkBtns.forEach(btn => btn.click());

        currentDocument.querySelectorAll('iframe').forEach(frame => {
            try {
                if (frame.contentDocument) scanForModalButtons(frame.contentDocument);
            } catch (e) {
                // Cross-origin frames cannot be inspected from this userscript.
            }
        });
    }

    /************************************************
     * STATE MANAGEMENT & AUTOMATED POPUP INTERCEPTOR
     ************************************************/
    let autoRunnerTimer = null;

    function isAutoRunning() {
        return sessionStorage.getItem("SPARROW_AUTO_RUNNING") === "true";
    }

    function setAutoRunning(state) {
        sessionStorage.setItem("SPARROW_AUTO_RUNNING", state ? "true" : "false");
        if (!state) {
            clearSubmissionLock();
        }
    }

    function isSubmitting() {
        return sessionStorage.getItem("SPARROW_SUBMIT_LOCK") === "true";
    }

    function setSubmissionLock() {
        sessionStorage.setItem("SPARROW_SUBMIT_LOCK", "true");
    }

    function clearSubmissionLock() {
        sessionStorage.removeItem("SPARROW_SUBMIT_LOCK");
    }

    /************************************************
     * CONFIGURATION
     ************************************************/
    const CONFIG = {
        PLACE: "New Delhi",
        MIN_GRADE: 7.0,
        MAX_GRADE: 9.0,
        STEP_DELAY_MS: 2500,      // Delay between steps
        SUBMIT_PAUSE_MS: 2000,    // Delay before submission dispatch

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

    /************************************************
     * ENHANCED LOGGING & HUD UTILITIES
     ************************************************/
    function logDOM(actionCategory, details) {
        const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
        console.groupCollapsed(`%c[SPARROW ${timestamp}] ${actionCategory}`, "color: #0275d8; font-weight: bold;");
        console.log(`Details:`, details);
        console.log(`URL:`, window.location.href);
        console.groupEnd();
    }

    function createHUD() {
        if (window.top !== window.self || document.getElementById("sparrow-hud-container")) return;

        const hud = document.createElement("div");
        hud.id = "sparrow-hud-container";
        hud.style.cssText = `
            position: fixed; top: 12px; right: 12px; z-index: 999999;
            padding: 12px 16px; border-radius: 6px; font-family: monospace, sans-serif;
            font-size: 12px; font-weight: bold; color: #ffffff;
            background-color: #1a1a1a; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
            border: 2px solid #0275d8; max-width: 440px; line-height: 1.4;
            transition: all 0.3s ease;
        `;
        hud.innerHTML = `
            <div style="font-size: 10px; opacity: 0.8; margin-bottom: 2px;">SPARROW AUTOMATION CONTROLLER</div>
            <div id="sparrow-status-text">Press "1" to START Continuous Run | "2" to STOP</div>
        `;
        document.body.appendChild(hud);
    }

    function updateHUDStatus(message, borderColor = "#0275d8", bgColor = "#1a1a1a") {
        if (window.top !== window.self) {
            try {
                window.top.postMessage({ type: "SPARROW_HUD_UPDATE", message, borderColor, bgColor }, "*");
            } catch (e) {}
            return;
        }

        const statusEl = document.getElementById("sparrow-status-text");
        const hudEl = document.getElementById("sparrow-hud-container");
        if (statusEl && hudEl) {
            statusEl.innerText = message;
            hudEl.style.borderColor = borderColor;
            hudEl.style.backgroundColor = bgColor;
        }
    }

    window.addEventListener("message", function (e) {
        if (e.data && e.data.type === "SPARROW_HUD_UPDATE") {
            updateHUDStatus(e.data.message, e.data.borderColor, e.data.bgColor);
        }
    });

    /************************************************
     * SKIPPED ROW INDEX TRACKER UTILITIES
     ************************************************/
    function getSkippedIndices() {
        try {
            return JSON.parse(sessionStorage.getItem("SPARROW_SKIPPED_INDICES") || "[]");
        } catch (e) {
            return [];
        }
    }

    function recordCurrentActiveIndex() {
        let activeIdx = sessionStorage.getItem("SPARROW_ACTIVE_ROW_INDEX");
        if (activeIdx !== null) {
            let skipped = getSkippedIndices();
            let idxNum = parseInt(activeIdx, 10);
            if (!skipped.includes(idxNum)) {
                skipped.push(idxNum);
                sessionStorage.setItem("SPARROW_SKIPPED_INDICES", JSON.stringify(skipped));
                logDOM("SKIP_RECORDED", `Row Index #${idxNum} added to skipped history.`);
            }
        }
    }

    /************************************************
     * FORM HELPERS
     ************************************************/
    function forceFillAndValidate(el, value) {
        if (!el) return;
        el.removeAttribute("readonly");
        el.removeAttribute("disabled");
        el.readOnly = false;
        el.disabled = false;

        if (value !== undefined) {
            el.value = value;
        }

        ['focus', 'keydown', 'keypress', 'input', 'keyup', 'change', 'blur'].forEach(eventType => {
            el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
        });
    }

    function getAssessmentPeriod() {
        let period = { from: "", to: "" };
        document.querySelectorAll("div.lbl-bold").forEach(function (el) {
            if (el.textContent.trim() === "Assessment Period:") {
                let next = el.nextElementSibling;
                if (!next) return;
                let txt = next.textContent.trim();
                let m = txt.match(/(\d{2}\/\d{2}\/\d{4})\s*to\s*(\d{2}\/\d{2}\/\d{4})/);
                if (m) {
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
        const remarks = isFemaleOfficer() ? CONFIG.PEN_PICTURE_FEMALE : CONFIG.PEN_PICTURE_MALE;
        return remarks[Math.floor(Math.random() * remarks.length)];
    }

    function findDirectSubmitButton() {
        return document.getElementById("submitFormBtnId") ||
            document.querySelector('input[value="CR Section To Disclose"]') ||
            document.querySelector('input[value="Send To Accepting Authority"]') ||
            document.querySelector('input[value*="Disclose"]') ||
            document.querySelector('input[value*="Accepting Authority"]') ||
            document.querySelector('input[onclick*="doSubmitForm"]') ||
            document.querySelector('input[onclick*="checkMendatoryFields"]');
    }

    function triggerSubmission(submitBtn) {
        if (isSubmitting()) {
            logDOM("SUBMIT_SKIP", "Submission already in progress, waiting for response.");
            return;
        }

        setSubmissionLock();
        logDOM("SUBMIT_TRIGGER", "Locking submission state and executing native SPARROW handlers...");

        if (typeof window.checkMendatoryFields === "function") {
            try {
                let isValid = window.checkMendatoryFields();
                logDOM("VALIDATION_RESULT", `window.checkMendatoryFields() returned: ${isValid}`);
            } catch (e) {
                logDOM("NATIVE_ERR", e);
            }
        }

        if (typeof window.doSubmitForm === "function") {
            try {
                logDOM("SUBMIT_EXEC", "Calling native window.doSubmitForm()");
                window.doSubmitForm();
                scheduleNextStep(4500);
                return;
            } catch (e) {
                logDOM("NATIVE_ERR", e);
            }
        }

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

            if (submitBtn.form && typeof submitBtn.form.requestSubmit === "function") {
                try {
                    logDOM("SUBMIT_EXEC", "Dispatched form.requestSubmit()");
                    submitBtn.form.requestSubmit(submitBtn);
                    scheduleNextStep(4500);
                    return;
                } catch (e) {
                    logDOM("NATIVE_ERR", e);
                }
            }

            logDOM("SUBMIT_EXEC", "Fallback: Standard DOM Click");
            submitBtn.click();
            scheduleNextStep(4500);
        } else {
            clearSubmissionLock();
            logDOM("SUBMIT_FAIL", "Could not locate submit element.");
        }
    }

    function returnToInbox() {
        clearSubmissionLock();
        recordCurrentActiveIndex();
        let backLink = Array.from(document.querySelectorAll("a")).find(a => a.textContent.trim().toUpperCase() === "BACK") ||
                       document.querySelector('a[href*="inbox/doShow"]');
        if (backLink) {
            backLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
            backLink.click();
        } else {
            window.history.back();
        }
    }

    function extractCurrentGrade() {
        let reviewGradeEl = document.getElementById("reviewInformationGradeID");
        let overallGradeEl = document.getElementById("overallGradingId");
        let acceptGradeEl = document.getElementById("acceptanceInformationGradeID");

        if (acceptGradeEl && acceptGradeEl.value.trim() !== "") return acceptGradeEl.value.trim();
        if (reviewGradeEl && reviewGradeEl.value.trim() !== "") return reviewGradeEl.value.trim();
        if (overallGradeEl && overallGradeEl.value.trim() !== "") return overallGradeEl.value.trim();
        return "N/A";
    }

    function checkGradeAndWorkflowValid() {
        const reviewTab = document.getElementById("tabID3") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("REVIEW"));
        const acceptTab = document.getElementById("tabID4") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("ACCEPT"));
        const reportTab = document.getElementById("tabID2") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("REPORT"));

        const isReportingOnly = !reviewTab && !acceptTab && (
            reportTab ||
            document.getElementById("appPenPictureByReportingOfficer") ||
            document.getElementById("overallGradingId") ||
            document.getElementById("tabID2")
        );

        if (isReportingOnly) {
            logDOM("VALIDATION_SKIP", "Reporting Officer Stage detected. Skipping row...");
            updateHUDStatus("SKIPPED: Reporting Authority Stage. Returning to inbox...", "#d9534f", "#4a1010");
            return false;
        }

        let gradeVal = parseFloat(extractCurrentGrade());
        if (!isNaN(gradeVal)) {
            if (gradeVal < CONFIG.MIN_GRADE || gradeVal > CONFIG.MAX_GRADE) {
                logDOM("VALIDATION_SKIP", `Grade (${gradeVal}) outside target bounds [${CONFIG.MIN_GRADE}-${CONFIG.MAX_GRADE}].`);
                updateHUDStatus(`SKIPPED: Grade (${gradeVal}) out of range. Returning...`, "#d9534f", "#4a1010");
                return false;
            }
        }

        return true;
    }

    /************************************************
     * MAIN STEP EXECUTION CONTROLLER
     ************************************************/
    function executeNextStep() {
        if (!isAutoRunning()) return;

        // Re-enforce alert locks across frames
        lockNativeAlerts(window);
        try { lockNativeAlerts(window.top); } catch (e) {}
        try { lockNativeAlerts(window.parent); } catch (e) {}

        logDOM("STEP_EXECUTE", "Evaluating DOM state...");

        // 1. Digital Signing & Automatic DSC Execution
        const dscImg = document.querySelector('img[onclick*="getDSCSigning"]') ||
                       document.querySelector('img[src*="DSC-new-icon.gif"]');

        if (dscImg) {
            logDOM("ACTION", "Executing Digital Signing (DSC)");
            updateHUDStatus("ACTION: Executing Digital Signing (DSC)...", "#5cb85c", "#1e4620");
            dscImg.scrollIntoView({ behavior: 'smooth', block: 'center' });

            if (typeof window.getDSCSigning === "function") {
                window.getDSCSigning();
            } else {
                dscImg.click();
            }

            scheduleNextStep(4000);
            return;
        }

        // 2. Form Page Processing & Submitting Lock Resolution
        const isFormPage = document.getElementById("appPenPictureByReportingOfficer") ||
                           document.getElementById("appPenPictureByReviewOfficer") ||
                           document.getElementById("commentsOfAccpOfficer") ||
                           document.getElementById("tabID2") ||
                           document.getElementById("tabID3") ||
                           document.getElementById("tabID4");

        if (isFormPage) {
            if (isSubmitting()) {
                logDOM("SUBMIT_WAIT", "Submission is actively processing on SPARROW backend. Waiting...");
                updateHUDStatus("WAITING: SPARROW processing submission...", "#f0ad4e", "#3a2e10");
                scheduleNextStep(3000);
                return;
            }

            if (!checkGradeAndWorkflowValid()) {
                setTimeout(returnToInbox, 600);
                scheduleNextStep();
                return;
            }
        } else {
            clearSubmissionLock();
        }

        // 3. Tab & Authority Processing
        const activeTab = document.querySelector(".TabbedPanelsTabSelected");
        const tabText = activeTab ? activeTab.textContent.toUpperCase() : "";

        // --- SCENARIO A: REVIEWING OFFICER TAB ---
        if ((activeTab && (activeTab.id === "tabID3" || tabText.includes("REVIEW"))) ||
            (!activeTab && document.getElementById("appPenPictureByReviewOfficer"))) {

            logDOM("ACTION", "Populating Reviewing Officer Form...");
            let period = getAssessmentPeriod();
            forceFillAndValidate(document.getElementById("disableddatePickerRevOfficerFromID"), period.from);
            forceFillAndValidate(document.getElementById("disableddatePickerRevOfficerToID"), period.to);
            forceFillAndValidate(document.getElementById("datePickerduringFrom"), period.from);
            forceFillAndValidate(document.getElementById("datePickerduringTo"), period.to);

            let agree = document.getElementById("agreeReportingOfficerAssessmentYES");
            if (agree && !agree.checked) {
                agree.checked = true;
                agree.click();
                forceFillAndValidate(agree);
            }

            let opinion = document.getElementById("differenceOfOpinionDetail");
            if (opinion && (!opinion.value || opinion.value.trim() === "")) { forceFillAndValidate(opinion, "N/A"); }

            let reviewPen = document.getElementById("appPenPictureByReviewOfficer");
            if (reviewPen && (!reviewPen.value || reviewPen.value.trim() === "")) {
                forceFillAndValidate(reviewPen, getRandomPenPicture());
            } else if (reviewPen) {
                forceFillAndValidate(reviewPen, reviewPen.value);
            }

            let place = document.getElementById("revPlaceId");
            if (place && (!place.value || place.value.trim() === "")) { forceFillAndValidate(place, CONFIG.PLACE); }

            const submitBtn = findDirectSubmitButton();
            if (submitBtn) {
                updateHUDStatus(`SUBMITTING: Reviewing Form (Grade: ${extractCurrentGrade()})...`, "#f0ad4e", "#3a2e10");
                logDOM("PAUSE", `Form filled. Executing submission in ${CONFIG.SUBMIT_PAUSE_MS}ms...`);

                setTimeout(() => {
                    if (isAutoRunning()) triggerSubmission(submitBtn);
                }, CONFIG.SUBMIT_PAUSE_MS);
                return;
            }
        }

        // --- SCENARIO B: ACCEPTING OFFICER TAB ---
        if ((activeTab && (activeTab.id === "tabID4" || tabText.includes("ACCEPT"))) ||
            (!activeTab && (document.getElementById("commentsOfAccpOfficer") || document.getElementById("acceptanceInformationGradeID")))) {

            logDOM("ACTION", "Populating Accepting Officer Form...");
            let period = getAssessmentPeriod();
            forceFillAndValidate(document.getElementById("disableddatePickerAccduringFrom"), period.from);
            forceFillAndValidate(document.getElementById("disableddatePickerAccduringTo"), period.to);

            let agree = document.getElementById("agreeRemarksReportingReviewingYES");
            if (agree && !agree.checked) {
                agree.checked = true;
                agree.click();
                forceFillAndValidate(agree);
            }

            let acceptComments = document.getElementById("commentsOfAccpOfficer");
            if (acceptComments && (!acceptComments.value || acceptComments.value.trim() === "")) {
                forceFillAndValidate(acceptComments, "N/A");
            } else if (acceptComments) {
                forceFillAndValidate(acceptComments, acceptComments.value);
            }

            let reviewGradeField = document.getElementById("reviewInformationGradeID");
            let acceptGradeField = document.getElementById("acceptanceInformationGradeID");

            if (reviewGradeField && acceptGradeField) {
                let reviewGrade = parseFloat(reviewGradeField.value);
                if (!isNaN(reviewGrade)) {
                    let rounded = Math.round(reviewGrade * 2) / 2;
                    forceFillAndValidate(acceptGradeField, rounded);
                }
            }

            let place = document.getElementById("accPlaceId");
            if (place && (!place.value || place.value.trim() === "")) { forceFillAndValidate(place, CONFIG.PLACE); }

            const submitBtn = findDirectSubmitButton();
            if (submitBtn) {
                updateHUDStatus(`SUBMITTING: Accepting Form (Grade: ${extractCurrentGrade()})...`, "#f0ad4e", "#3a2e10");
                logDOM("PAUSE", `Form filled. Executing submission in ${CONFIG.SUBMIT_PAUSE_MS}ms...`);

                setTimeout(() => {
                    if (isAutoRunning()) triggerSubmission(submitBtn);
                }, CONFIG.SUBMIT_PAUSE_MS);
                return;
            }
        }

        // --- SCENARIO C: AUTOMATIC NAVIGATION & INBOX ADVANCEMENT ---
        const reviewTab = document.getElementById("tabID3") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("REVIEW"));
        const acceptTab = document.getElementById("tabID4") || Array.from(document.querySelectorAll(".TabbedPanelsTab")).find(el => el.textContent.toUpperCase().includes("ACCEPT"));

        if (reviewTab && !reviewTab.classList.contains("TabbedPanelsTabSelected")) {
            logDOM("NAV", "Switching to Reviewing Tab");
            updateHUDStatus("ACTION: Switching to Reviewing Tab...", "#5cb85c", "#1e4620");
            reviewTab.click();
            scheduleNextStep();
            return;
        } else if (acceptTab && !acceptTab.classList.contains("TabbedPanelsTabSelected")) {
            logDOM("NAV", "Switching to Accepting Tab");
            updateHUDStatus("ACTION: Switching to Accepting Tab...", "#5cb85c", "#1e4620");
            acceptTab.click();
            scheduleNextStep();
            return;
        }

        let backLink = Array.from(document.querySelectorAll("a")).find(a => a.textContent.trim().toUpperCase() === "BACK") ||
                       document.querySelector('a[href*="inbox/doShow"]');

        if (backLink && !document.querySelector("#dataGrid, #dataGridForStage") && !document.getElementById("tabID1")) {
            logDOM("NAV", "Navigating back to Inbox and logging skip...");
            updateHUDStatus("ACTION: Navigating Back and Skipping...", "#d9534f", "#4a1010");
            setTimeout(returnToInbox, 300);
            scheduleNextStep();
            return;
        }

        // --- INBOX ROW ADVANCEMENT & AJAX REFRESH FIX ---
        const tabID1 = document.getElementById("tabID1");
        const hasTable = document.querySelector("#dataGrid, #dataGridForStage");

        if (tabID1 && !hasTable) {
            logDOM("INBOX_REFRESH", "Assess PAR tab found, but table is empty. Executing AJAX fetch...");
            updateHUDStatus("ACTION: Refreshing Assess PAR Inbox Data...", "#5cb85c", "#1e4620");

            if (!tabID1.classList.contains("TabbedPanelsTabSelected")) {
                tabID1.click();
            }

            if (typeof window.showInboxData === "function") {
                window.showInboxData('assessParDivID', 'A');
            } else {
                tabID1.click();
            }

            scheduleNextStep(3500);
            return;
        }

        if (hasTable) {
            clearSubmissionLock();

            if (tabID1 && !tabID1.classList.contains("TabbedPanelsTabSelected")) {
                logDOM("NAV", "Switching to Assess PAR Inbox tab");
                updateHUDStatus("ACTION: Navigating to 'Assess PAR' Inbox Tab...", "#5cb85c", "#1e4620");
                tabID1.click();
                if (typeof window.showInboxData === "function") {
                    window.showInboxData('assessParDivID', 'A');
                }
                scheduleNextStep(3000);
                return;
            }

            const skippedIndices = getSkippedIndices();
            const rows = Array.from(document.querySelectorAll("#dataGrid tbody tr, #dataGridForStage tbody tr"));
            let selectedLink = null;
            let selectedRowIndex = -1;

            for (let i = 0; i < rows.length; i++) {
                if (skippedIndices.includes(i)) continue;

                const link = rows[i].querySelector("a[onclick*='doInboxRedirect']") || rows[i].querySelector("td a");
                if (link) {
                    selectedLink = link;
                    selectedRowIndex = i;
                    break;
                }
            }

            if (selectedLink && selectedRowIndex !== -1) {
                sessionStorage.setItem("SPARROW_ACTIVE_ROW_INDEX", selectedRowIndex.toString());
                logDOM("INBOX_OPEN", `Opening Row #${selectedRowIndex + 1} (${selectedLink.innerText.trim()})`);
                updateHUDStatus(`ACTION: Opening Row #${selectedRowIndex + 1} (${selectedLink.innerText.trim()})...`, "#5cb85c", "#1e4620");
                selectedLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                selectedLink.click();
                scheduleNextStep();
            } else {
                logDOM("INBOX_IDLE", "All rows skipped or completed.");
                updateHUDStatus("INBOX IDLE: All available PARs completed/skipped.", "#d9534f", "#4a1010");
                setAutoRunning(false);
            }
            return;
        }

        logDOM("UNMATCHED_STATE", "No valid action target found.");
        updateHUDStatus("ERROR: State Unmatched or Action Undefined.", "#d9534f", "#4a1010");
    }

    function scheduleNextStep(customDelay) {
        if (autoRunnerTimer) clearTimeout(autoRunnerTimer);
        if (isAutoRunning()) {
            let delay = customDelay || CONFIG.STEP_DELAY_MS;
            autoRunnerTimer = setTimeout(executeNextStep, delay);
        }
    }

    function startAutoRunner() {
        setAutoRunning(true);
        updateHUDStatus("RUNNING: Continuous Automation Active...", "#5cb85c", "#1e4620");
        logDOM("SYSTEM", "Continuous Automation Started");
        executeNextStep();
    }

    function stopAutoRunner() {
        setAutoRunning(false);
        if (autoRunnerTimer) clearTimeout(autoRunnerTimer);
        updateHUDStatus("STOPPED: Automation Halted. Press '1' to Resume.", "#d9534f", "#4a1010");
        logDOM("SYSTEM", "Continuous Automation Halted by User");
    }

    /************************************************
     * KEYBOARD LISTENERS & INITIALIZATION
     ************************************************/
    window.addEventListener("keydown", function (e) {
        const tag = (document.activeElement && document.activeElement.tagName) || "";
        if (["INPUT", "TEXTAREA"].includes(tag) && document.activeElement.type === "text") return;

        if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
            startAutoRunner();
        } else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
            stopAutoRunner();
        }
    }, true);

    if (document.readyState === "complete" || document.readyState === "interactive") {
        createHUD();
        if (isAutoRunning()) scheduleNextStep();
    } else {
        window.addEventListener("DOMContentLoaded", function () {
            createHUD();
            if (isAutoRunning()) scheduleNextStep();
        });
    }
})();