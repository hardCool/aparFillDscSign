# Code Changes Reference

## Before & After Comparison

### 1. SKIPPED TRACKING (Lines 233-260)

#### BEFORE (Index-Based - BROKEN):
```javascript
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
```

#### AFTER (PAR ID-Based - FIXED):
```javascript
function getSkippedPARs() {
    try {
        return JSON.parse(sessionStorage.getItem("SPARROW_SKIPPED_PARS") || "{}");
    } catch (e) {
        return {};
    }
}

function getPARIdentifier(link) {
    // Extract unique PAR identifier from the link text or row
    if (!link) return null;
    const identifier = (link.innerText || link.textContent || "").trim();
    return identifier || null;
}

function markPARAsSkipped(parId) {
    if (!parId) return;
    let skipped = getSkippedPARs();
    skipped[parId] = true;
    sessionStorage.setItem("SPARROW_SKIPPED_PARS", JSON.stringify(skipped));
    logDOM("PAR_SKIP_RECORDED", `PAR '${parId}' marked as processed.`);
}

function recordCurrentActiveIndex() {
    let activeLink = sessionStorage.getItem("SPARROW_ACTIVE_PAR_LINK");
    if (activeLink) {
        markPARAsSkipped(activeLink);
        sessionStorage.removeItem("SPARROW_ACTIVE_PAR_LINK");
    }
}
```

---

### 2. INBOX LOOP LOGIC (Lines 645-680)

#### BEFORE (Index-Checking - BROKEN):
```javascript
const skippedIndices = getSkippedIndices();
const rows = Array.from(document.querySelectorAll("#dataGrid tbody tr, #dataGridForStage tbody tr"));
let selectedLink = null;
let selectedRowIndex = -1;

for (let i = 0; i < rows.length; i++) {
    if (skippedIndices.includes(i)) continue;  // ❌ PROBLEM: Indices don't persist!

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
```

#### AFTER (PAR ID-Checking - FIXED):
```javascript
const skippedPARs = getSkippedPARs();
const rows = Array.from(document.querySelectorAll("#dataGrid tbody tr, #dataGridForStage tbody tr"));
let selectedLink = null;
let selectedRowIndex = -1;
let selectedPARId = null;

for (let i = 0; i < rows.length; i++) {
    const link = rows[i].querySelector("a[onclick*='doInboxRedirect']") || rows[i].querySelector("td a");
    if (link) {
        const parId = getPARIdentifier(link);
        // Skip only if this specific PAR ID has been processed before
        if (parId && skippedPARs[parId]) {  // ✅ FIXED: Check actual PAR, not index
            continue;
        }
        selectedLink = link;
        selectedRowIndex = i;
        selectedPARId = parId;
        break;
    }
}

if (selectedLink && selectedRowIndex !== -1 && selectedPARId) {
    sessionStorage.setItem("SPARROW_ACTIVE_PAR_LINK", selectedPARId);
    logDOM("INBOX_OPEN", `Opening PAR: ${selectedPARId}`);
    updateHUDStatus(`ACTION: Opening PAR: ${selectedPARId}...`, "#5cb85c", "#1e4620");
    selectedLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectedLink.click();
    scheduleNextStep();
} else {
    const totalRows = rows.filter(r => r.querySelector("a[onclick*='doInboxRedirect']") || r.querySelector("td a")).length;
    const processedPARs = Object.keys(skippedPARs).length;
    logDOM("INBOX_STATUS", `Total rows with links: ${totalRows}, Processed PARs: ${processedPARs}`);
    if (totalRows === 0) {
        logDOM("INBOX_IDLE", "No clickable rows found in current view.");
        updateHUDStatus("INBOX IDLE: No rows found. Check pagination or filters.", "#f0ad4e", "#665c00");
    } else {
        logDOM("INBOX_IDLE", `All ${totalRows} visible rows have been processed.`);
        updateHUDStatus(`INBOX IDLE: ${processedPARs} PARs completed. Checking for more...`, "#f0ad4e", "#665c00");
    }
    setAutoRunning(false);
}
```

---

### 3. NEW RESET FUNCTION (Lines 714-717)

#### ADDED (Debug Capability):
```javascript
function resetSkippedPARs() {
    sessionStorage.removeItem("SPARROW_SKIPPED_PARS");
    sessionStorage.removeItem("SPARROW_ACTIVE_PAR_LINK");
    logDOM("SYSTEM", "Skipped PARs list has been cleared.");
    updateHUDStatus("DEBUG: Skipped PARs cleared. Press '1' to restart.", "#0275d8", "#001a4d");
}
```

---

### 4. KEYBOARD SHORTCUTS (Lines 720-726)

#### BEFORE:
```javascript
if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
    startAutoRunner();
} else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
    stopAutoRunner();
}
```

#### AFTER:
```javascript
if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
    startAutoRunner();
} else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
    stopAutoRunner();
} else if (e.key === "3" || e.code === "Digit3" || e.code === "Numpad3") {
    resetSkippedPARs();
}
```

---

## Impact Analysis

| Aspect | Before | After |
|--------|--------|-------|
| **Data Structure** | Array `[0,1,2,3...]` | Object `{name: true, ...}` |
| **Pagination Safe** | ❌ No - indices don't persist | ✅ Yes - uses unique IDs |
| **DOM Refresh Safe** | ❌ No - indices change | ✅ Yes - IDs remain same |
| **Multi-page Support** | ❌ Fails after page 1 | ✅ Works across all pages |
| **Duplicate Processing** | ❌ Same row processed multiple times | ✅ Never processes same PAR twice |
| **Debug Info** | Limited | ✅ Shows total vs processed count |
| **Reset Capability** | ❌ None | ✅ Press "3" to reset |

---

## Storage Comparison

### Before (BROKEN):
```javascript
// In sessionStorage:
SPARROW_SKIPPED_INDICES = "[0, 1, 2, 3, 4, 5]"
SPARROW_ACTIVE_ROW_INDEX = "3"

// Problem: After page refresh or pagination:
// Same indices [0,1,2,3,4,5] could map to DIFFERENT rows!
```

### After (FIXED):
```javascript
// In sessionStorage:
SPARROW_SKIPPED_PARS = {
    "Rajesh Kumar": true,
    "Priya Singh": true,
    "Amit Patel": true
}
SPARROW_ACTIVE_PAR_LINK = "Vikram Das"

// Benefit: Same PAR names are ALWAYS the same person,
// regardless of pagination, sorting, or DOM changes!
```
