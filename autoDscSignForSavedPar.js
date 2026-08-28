// ==UserScript==
// @name         autoDscSignForSavedPar
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Automates batch submission of drafted PARs supporting both Disclose & Accepting Authority flows (1: Start, 2: Stop)
// @author       Hardev Singh
// @match        *://sparrowdelhipolice.saccess.nic.in/*
// @match        *://sparrow2delhipolice.saccess.nic.in/*
// @match        *://*.saccess.nic.in/*
// @match        *://*.nic.in/*
// @run-at       document-idle
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/hardCool/aparFillDscSign/main/autoDscSignForSavedPar.js
// @downloadURL  https://raw.githubusercontent.com/hardCool/aparFillDscSign/main/autoDscSignForSavedPar.js
// ==/UserScript==

(function () {
    'use strict';

    const STATE_KEY = "SPARROW_SUBMIT_STATE";
    const RUN_KEY = "SPARROW_SUBMIT_RUNNING";
    const DELAY_MS = 1000;

    const STATES = {
        IDLE: "IDLE",
        OPEN_FIRST_DRAFT: "OPEN_FIRST_DRAFT",
        CLICK_SUBMIT: "CLICK_SUBMIT",
        CLICK_DSC: "CLICK_DSC",
        CLICK_BACK: "CLICK_BACK"
    };

    let isExecutingStep = false;

    /************************************************
     * ON-SCREEN HUD STATUS DISPLAY
     ************************************************/
    function createHUD() {
        if (window.top !== window.self) return;
        if (document.getElementById("sparrow-hud")) return;

        const hud = document.createElement("div");
        hud.id = "sparrow-hud";
        hud.style.cssText = `
            position: fixed;
            top: 15px;
            right: 15px;
            z-index: 999999;
            padding: 10px 16px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            font-weight: bold;
            color: #ffffff;
            background-color: #333333;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            border: 2px solid #555;
            transition: all 0.3s ease;
        `;
        hud.innerHTML = `SPARROW: <span id="sparrow-status">IDLE</span> (Press 1: Start | 2: Stop)`;
        document.body.appendChild(hud);
    }

    function updateHUD(text, bgColor) {
        if (window.top !== window.self) {
            try { window.top.postMessage({ type: "SPARROW_HUD_UPDATE", text, bgColor }, "*"); } catch(e){}
            return;
        }
        const statusEl = document.getElementById("sparrow-status");
        const hudEl = document.getElementById("sparrow-hud");
        if (statusEl && hudEl) {
            statusEl.innerText = text;
            hudEl.style.backgroundColor = bgColor || "#333333";
        }
    }

    window.addEventListener("message", function (e) {
        if (e.data && e.data.type === "SPARROW_HUD_UPDATE") {
            updateHUD(e.data.text, e.data.bgColor);
        }
    });

    /************************************************
     * STATE MANAGEMENT
     ************************************************/
    function isRunning() {
        return sessionStorage.getItem(RUN_KEY) === "true";
    }

    function setRunning(running) {
        sessionStorage.setItem(RUN_KEY, running ? "true" : "false");
        if (!running) {
            sessionStorage.setItem(STATE_KEY, STATES.IDLE);
            updateHUD("STOPPED", "#d9534f");
            console.log("🛑 SPARROW Automation: STOPPED.");
        } else {
            updateHUD("RUNNING...", "#5cb85c");
            console.log("▶️ SPARROW Automation: STARTED.");
        }
    }

    function getState() {
        return sessionStorage.getItem(STATE_KEY) || STATES.IDLE;
    }

    function setState(newState) {
        sessionStorage.setItem(STATE_KEY, newState);
        console.log(`[SPARROW State Transition] -> ${newState}`);
    }

    /************************************************
     * HOTKEYS (1 = START, 2 = STOP)
     ************************************************/
    function handleGlobalKeys(e) {
        const tag = (document.activeElement && document.activeElement.tagName) || "";
        if (["INPUT", "TEXTAREA"].includes(tag) && document.activeElement.type === "text") return;

        if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
            setRunning(true);
            setState(STATES.OPEN_FIRST_DRAFT);
            executePipeline();
        } else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
            setRunning(false);
        }
    }

    window.addEventListener("keydown", handleGlobalKeys, true);

    /************************************************
     * AUTO-ACCEPT ALERTS / POPUPS
     ************************************************/
    window.alert = function (msg) {
        console.log("[SPARROW Alert Intercepted]:", msg);
        return true;
    };
    window.confirm = function (msg) {
        console.log("[SPARROW Confirm Intercepted]:", msg);
        return true;
    };

    /************************************************
     * HELPER: SUBMIT BUTTON FINDER
     ************************************************/
    function findSubmitButton() {
        // Direct ID lookup
        const btnById = document.getElementById("submitFormBtnId");
        if (btnById) return btnById;

        // Attribute / Value lookups
        return document.querySelector('input[value="CR Section To Disclose"]') ||
               document.querySelector('input[value="Send To Accepting Authority"]') ||
               document.querySelector('input[value*="Disclose"]') ||
               document.querySelector('input[value*="Accepting Authority"]');
    }

    /************************************************
     * PIPELINE WORKFLOW ACTIONS
     ************************************************/

    // ACTION 1: Open First Draft Record from Inbox Table
    function openFirstDraftRecord() {
        const assessTab = document.getElementById("tabID1");
        if (assessTab && !assessTab.classList.contains("TabbedPanelsTabSelected")) {
            assessTab.click();
            if (typeof window.showInboxData === "function") {
                window.showInboxData('assessParDivID', 'A');
            }
        }

        const rows = document.querySelectorAll("#dataGrid tbody tr, #dataGridForStage tbody tr");
        if (!rows || rows.length === 0) return false;

        let targetLink = null;
        for (let row of rows) {
            const isDrafted = row.querySelector("img[src*='draft.png']") ||
                              row.querySelector("img[title*='Drafted']") ||
                              row.textContent.includes("Drafted");

            if (isDrafted) {
                targetLink = row.querySelector("a[onclick*='doInboxRedirect']") || row.querySelector("td a");
                if (targetLink) break;
            }
        }

        if (targetLink) {
            isExecutingStep = true;
            updateHUD("Step 1/4: Opening Draft Record...", "#0275d8");
            setState(STATES.CLICK_SUBMIT);

            setTimeout(() => {
                if (!isRunning()) return;
                targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetLink.click();
            }, DELAY_MS);
            return true;
        } else {
            updateHUD("Finished: No Drafts Left!", "#f0ad4e");
            setRunning(false);
            return false;
        }
    }

    // ACTION 2: Click "CR Section To Disclose" OR "Send To Accepting Authority"
    function clickCRSectionToDisclose() {
        const btn = findSubmitButton();

        if (btn) {
            isExecutingStep = true;
            const btnText = btn.value || "Submit";
            updateHUD(`Step 2/4: Clicking ${btnText}...`, "#0275d8");
            setState(STATES.CLICK_DSC);

            setTimeout(() => {
                if (!isRunning()) return;
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });

                if (typeof window.checkMendatoryFields === "function") {
                    try { window.checkMendatoryFields(); } catch(e){}
                }

                btn.click();
            }, DELAY_MS);
            return true;
        }
        return false;
    }

    // ACTION 3: Click DSC Icon
    function clickDSC() {
        const dscImg = document.querySelector('img[onclick*="getDSCSigning"]') ||
                       document.querySelector('img[src*="DSC-new-icon.gif"]');

        if (dscImg) {
            isExecutingStep = true;
            updateHUD("Step 3/4: Triggering DSC...", "#0275d8");
            setState(STATES.CLICK_BACK);

            setTimeout(() => {
                if (!isRunning()) return;
                dscImg.scrollIntoView({ behavior: 'smooth', block: 'center' });

                if (typeof window.getDSCSigning === "function") {
                    window.getDSCSigning();
                } else {
                    dscImg.click();
                }

                setTimeout(() => {
                    if (isRunning() && getState() === STATES.CLICK_BACK) {
                        isExecutingStep = false;
                        executePipeline();
                    }
                }, 2500);
            }, DELAY_MS);
            return true;
        }
        return false;
    }

    // ACTION 4: Click BACK Link
    function clickBack() {
        let backLink = null;

        const anchors = document.querySelectorAll("a");
        for (let a of anchors) {
            if (a.textContent.trim().toUpperCase() === "BACK") {
                backLink = a;
                break;
            }
        }

        if (!backLink) {
            backLink = document.querySelector('a[href*="inbox/doShow?inboxType=A"]') ||
                       document.querySelector('a[href*="inbox/doShow"]');
        }

        if (backLink) {
            isExecutingStep = true;
            updateHUD("Step 4/4: Returning to Inbox...", "#0275d8");
            setState(STATES.OPEN_FIRST_DRAFT);

            setTimeout(() => {
                if (!isRunning()) return;

                try {
                    backLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    backLink.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
                    backLink.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
                    backLink.click();

                    setTimeout(() => {
                        if (isRunning() && backLink.href) {
                            window.location.href = backLink.href;
                        }
                    }, 500);
                } catch (e) {
                    if (backLink.href) window.location.href = backLink.href;
                }
            }, DELAY_MS);
            return true;
        }
        return false;
    }

    /************************************************
     * PIPELINE CONTROLLER (DOM-VALIDATED)
     ************************************************/
    function executePipeline() {
        if (!isRunning() || isExecutingStep) return;

        const hasTable = document.querySelector("#dataGrid, #dataGridForStage");
        const hasSubmitBtn = findSubmitButton();
        const hasDSCImg = document.querySelector('img[onclick*="getDSCSigning"], img[src*="DSC-new-icon.gif"]');
        const hasBackLink = Array.from(document.querySelectorAll('a')).some(a => a.textContent.trim().toUpperCase() === "BACK");

        if (hasDSCImg) {
            clickDSC();
        } else if (hasSubmitBtn) {
            clickCRSectionToDisclose();
        } else if (hasBackLink && !hasTable) {
            clickBack();
        } else if (hasTable) {
            openFirstDraftRecord();
        }
    }

    function init() {
        createHUD();
        if (isRunning()) {
            updateHUD("RUNNING...", "#5cb85c");

            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (!isRunning()) {
                    clearInterval(interval);
                    return;
                }

                executePipeline();

                if (attempts >= 15 || isExecutingStep) {
                    clearInterval(interval);
                }
            }, 400);
        }
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        window.addEventListener("DOMContentLoaded", init);
    }
})();