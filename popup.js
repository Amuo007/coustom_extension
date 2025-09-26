console.log("✅ popup.js loaded");

document.addEventListener("DOMContentLoaded", async () => {
  await loadStoredResponses();
  await checkProcessingStatus();
  await showChatStatus();
  // Clear badge when popup opens
  chrome.action.setBadgeText({ text: "" });
});

document.getElementById("capture").addEventListener("click", async () => {
  const responseDiv = document.getElementById("response");
  const captureBtn = document.getElementById("capture");

  try {
    responseDiv.innerHTML = '<div class="loading">Taking screenshot...</div>';
    captureBtn.disabled = true;
    captureBtn.textContent = "Processing...";

    // Take screenshot
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 60 }, (dataUrl) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(dataUrl);
      });
    });

    // Get current tab URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = tab?.url || "Unknown URL";

    // Send to background script
    const res = await chrome.runtime.sendMessage({
      action: "analyzeScreenshot",
      screenshot: dataUrl,
      tabUrl
    });

    if (res && res.success) {
      responseDiv.innerHTML = `
        <div class="success-message">
          ✓ Screenshot sent to Claude AI!<br/>
          Processing in background... Check history in a moment.
        </div>
      `;
      // Refresh history and chat status after a short delay
      setTimeout(() => {
        loadStoredResponses();
        showChatStatus();
      }, 2000);
    } else {
      responseDiv.innerHTML = `<span style="color:red">Failed to send screenshot.</span>`;
    }
  } catch (err) {
    console.error("Popup error:", err);
    responseDiv.innerHTML = `<span style="color:red"><b>Error:</b> ${err.message}</span>`;
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = "Take Screenshot & Analyze";
  }
});

// Clear all stored results
document.getElementById("clearHistory").addEventListener("click", async () => {
  if (confirm("Clear all stored responses AND reset chat memory?")) {
    await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ action: "resetChat" });
    await loadStoredResponses();
    await showChatStatus();
  }
});

async function checkProcessingStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ action: "getProcessingStatus" });
    if (res?.isProcessing) {
      document.getElementById("response").innerHTML = `
        <div class="processing-message">
          ⏳ Analysis in progress...
        </div>
      `;
    }
  } catch {
    // service worker may be sleeping; ignore
  }
}

async function showChatStatus() {
  const { chatHistory = [] } = await chrome.storage.local.get(['chatHistory']);
  const statusDiv = document.getElementById("response");
  
  if (chatHistory.length > 0) {
    statusDiv.innerHTML = `
      <div style="background: #e8f5e8; padding: 10px; border-radius: 4px; color: #2e7d32;">
        💬 <strong>Chat Active:</strong> ${chatHistory.length} question(s) in memory<br/>
        <small>Next screenshot will continue the conversation</small>
      </div>
    `;
  } else {
    statusDiv.innerHTML = `
      <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; color: #666;">
        🆕 <strong>New Chat:</strong> Ready to start<br/>
        <small>First screenshot will begin a new conversation</small>
      </div>
    `;
  }
}

async function loadStoredResponses() {
  const historyDiv = document.getElementById("history");
  const result = await chrome.storage.local.get(["responses"]);
  const responses = result.responses || [];

  if (!responses.length) {
    historyDiv.innerHTML = '<div class="no-history">No stored responses yet.</div>';
    return;
  }

  let html = '<h4>Response History:</h4>';
  for (const item of responses) {
    const date = new Date(item.timestamp).toLocaleString();
    const short = item.response.length > 140 ? item.response.slice(0, 140) + "..." : item.response;

    html += `
      <div class="history-item" data-id="${item.id}">
        <div class="history-header">
          <small>${date}</small>
          <button class="delete-btn" data-action="delete" data-id="${item.id}">×</button>
        </div>
        <div class="history-content">${short.replace(/\n/g, "<br>")}</div>
        <div class="history-actions">
          <button class="view-btn" data-action="view" data-id="${item.id}">View Full</button>
          <button class="copy-btn" data-action="copy" data-id="${item.id}">Copy</button>
        </div>
      </div>
    `;
  }

  historyDiv.innerHTML = html;

  // Add event listeners to all buttons with data-action
  historyDiv.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', handleHistoryAction);
  });
}

// Handle all history button clicks
async function handleHistoryAction(event) {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;

  if (action === 'delete') {
    await deleteResponse(id);
  } else if (action === 'view') {
    await viewFullResponse(id);
  } else if (action === 'copy') {
    await copyResponse(id, event.target);
  }
}

async function deleteResponse(id) {
  const { responses = [] } = await chrome.storage.local.get(["responses"]);
  const updated = responses.filter(r => r.id !== id);
  await chrome.storage.local.set({ responses: updated });
  await loadStoredResponses();
}

async function viewFullResponse(id) {
  const { responses = [] } = await chrome.storage.local.get(["responses"]);
  const r = responses.find(x => x.id === id);
  if (r) {
    document.getElementById("response").innerHTML = `
      <strong>Full Response (${new Date(r.timestamp).toLocaleString()}):</strong><br/><br/>
      ${r.response.replace(/\n/g, "<br>")}<br/><br/>
      <small><strong>URL:</strong> ${r.url}</small>
    `;
  }
}

async function copyResponse(id, buttonElement) {
  const { responses = [] } = await chrome.storage.local.get(["responses"]);
  const r = responses.find(x => x.id === id);
  if (r) {
    await navigator.clipboard.writeText(r.response);
    // Show brief feedback
    if (buttonElement) {
      const originalText = buttonElement.textContent;
      const originalBackground = buttonElement.style.background;
      buttonElement.textContent = "Copied!";
      buttonElement.style.background = "#4CAF50";
      setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.style.background = originalBackground || "#FF9800";
      }, 1000);
    }
  }
}

// Auto-refresh history when storage changes
chrome.storage.onChanged.addListener((changes, ns) => {
  if (ns === "local" && changes.responses) {
    loadStoredResponses();
  }
});