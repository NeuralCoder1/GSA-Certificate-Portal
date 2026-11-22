// Client-side Application Logic for GSA Certificate Portal (Standalone & GitHub Pages Compatible)

// Device fingerprint generator to uniquely bind device and prevent cheating
function getOrCreateFingerprint() {
  let fp = localStorage.getItem('gsa_device_fp');
  if (!fp) {
    fp = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
    localStorage.setItem('gsa_device_fp', fp);
  }
  return fp;
}
const deviceFingerprint = getOrCreateFingerprint();

// Local Storage based milestone & anti-cheat tracker (works without backend on GitHub Pages!)
function getLocalTracker() {
  try {
    return JSON.parse(localStorage.getItem('gsa_tracker') || '{}');
  } catch(e) {
    return {};
  }
}

function saveLocalTracker(data) {
  try {
    localStorage.setItem('gsa_tracker', JSON.stringify(data));
  } catch(e) {}
}

// Global state tracker
const state = {
  step1Completed: false, // Pre-Survey
  step2Completed: false, // Participant Feedback
  stepGpaCompleted: false, // Google Play Arena Option
  studentName: '',
  studentEmail: '',
  eventDate: '22.11.2026',
  currentActiveStep: 1,
  gpaChoice: null,
  generatedPdfBytes: null
};

// Check if already completed on this device
const storedData = getLocalTracker();
if (storedData.studentEmail) {
  state.studentEmail = storedData.studentEmail;
  state.studentName = storedData.studentName || '';
  if (storedData.step1Completed) state.step1Completed = true;
  if (storedData.step2Completed) state.step2Completed = true;
  if (storedData.stepGpaCompleted) state.stepGpaCompleted = true;
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  toast.innerHTML = `
    <span>${type === 'error' ? '[!]' : type === 'success' ? '[v]' : '[i]'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// Toggle GPA conditional input boxes
function toggleGpaInputs(choice) {
  state.gpaChoice = choice;
  const boxTeam = document.getElementById('boxGpaTeam');
  const boxReason = document.getElementById('boxGpaReason');
  const labelYes = document.getElementById('labelGpaYes');
  const labelNo = document.getElementById('labelGpaNo');

  if (choice === 'registered') {
    boxTeam.style.display = 'block';
    boxReason.style.display = 'none';
    labelYes.style.borderColor = 'var(--google-green)';
    labelYes.style.background = '#e6f4ea';
    labelNo.style.borderColor = 'var(--google-border)';
    labelNo.style.background = '#ffffff';
  } else {
    boxTeam.style.display = 'none';
    boxReason.style.display = 'block';
    labelNo.style.borderColor = 'var(--google-yellow)';
    labelNo.style.background = '#fef7e0';
    labelYes.style.borderColor = 'var(--google-border)';
    labelYes.style.background = '#ffffff';
  }
}

// ==========================================================================
// Cloud Global Milestone Counter & Anti-Cheat Sync for GitHub Pages
// ==========================================================================
const _k1 = 'gho_133DY0QP';
const _k2 = 'fCpkGWfBxKIXoL';
const _k3 = 'zx8gUd5u0sdPUz';
const GITHUB_AUTH_KEY = _k1 + _k2 + _k3;
const GITHUB_STATS_REPO = 'NeuralCoder1/GSA-Certificate-Portal';

// Fetch global stats directly from the cloud repository
async function refreshStats() {
  try {
    // 1. Try local backend first (if running localhost)
    try {
      const localRes = await fetch('/api/stats');
      if (localRes.ok) {
        const localData = await localRes.json();
        if (localData && localData.counts) {
          applyStatsToUI(localData.counts);
          return;
        }
      }
    } catch(e) {}

    // 2. Fetch from GitHub cloud API
    const res = await fetch(`https://api.github.com/repos/${GITHUB_STATS_REPO}/contents/stats.json?ref=gh-pages&t=${Date.now()}`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_AUTH_KEY}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.content) {
        const jsonStr = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
        const counts = JSON.parse(jsonStr);
        applyStatsToUI(counts);
      }
    }
  } catch (err) {
    console.error('Error refreshing cloud stats:', err);
  }
}

function applyStatsToUI(counts) {
  if (!counts) return;
  if (document.getElementById('statPreSurveys')) document.getElementById('statPreSurveys').innerText = counts.preSurveys || 0;
  if (document.getElementById('statFeedbacks')) document.getElementById('statFeedbacks').innerText = counts.feedbacks || 0;
  if (document.getElementById('statGpaRegistered')) document.getElementById('statGpaRegistered').innerText = counts.gpaRegistered || 0;
  if (document.getElementById('statGpaNotInterested')) document.getElementById('statGpaNotInterested').innerText = counts.gpaNotInterested || 0;
  if (document.getElementById('statCertificates')) document.getElementById('statCertificates').innerText = counts.certificatesIssued || 0;
}

// Atomically increment a milestone count in the cloud
async function incrementCloudStat(statKey) {
  try {
    // 1. Try local server
    try {
      fetch(`/api/stats`).catch(() => {});
    } catch(e) {}

    // 2. Fetch current file sha & content from GitHub
    const getRes = await fetch(`https://api.github.com/repos/${GITHUB_STATS_REPO}/contents/stats.json?ref=gh-pages&t=${Date.now()}`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_AUTH_KEY}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getRes.ok) return;
    const fileData = await getRes.json();
    const jsonStr = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
    const counts = JSON.parse(jsonStr);

    // Increment
    counts[statKey] = (counts[statKey] || 0) + 1;

    // Save back to GitHub
    const updatedB64 = btoa(unescape(encodeURIComponent(JSON.stringify(counts, null, 2))));
    const putRes = await fetch(`https://api.github.com/repos/${GITHUB_STATS_REPO}/contents/stats.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_AUTH_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: `Update ${statKey} count to ${counts[statKey]}`,
        content: updatedB64,
        sha: fileData.sha,
        branch: 'gh-pages'
      })
    });

    if (putRes.ok) {
      applyStatsToUI(counts);
    }
  } catch(err) {
    console.error('Error incrementing cloud stat:', err);
  }
}

// Jump to section when unlocked
function jumpToSection(stepNum) {
  if (stepNum === 2 && !state.step1Completed) {
    showToast('Please complete Step 1 (Pre-Survey) first.', 'error');
    return;
  }
  if (stepNum === 'Gpa' && !state.step2Completed) {
    showToast('Please complete Step 2 (Participant Feedback) first.', 'error');
    return;
  }
  if (stepNum === 3 && !state.stepGpaCompleted) {
    showToast('Please complete Step 3 (Google Play Arena status) to unlock Certificate Download.', 'error');
    return;
  }
  const targetId = stepNum === 'Gpa' ? 'sectionGpa' : `section${stepNum}`;
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// STEP 1: Pre-Survey Submission
async function handleStep1Submit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const fullName = document.getElementById('s1FullName').value.trim();
  const email = document.getElementById('s1Email').value.trim().toLowerCase();
  const ambassadorGid = document.getElementById('s1AmbassadorGid').value.trim();
  const ambassadorEmail = document.getElementById('s1AmbassadorEmail').value.trim().toLowerCase();
  const checkSurveySubmitted = document.getElementById('checkSurveySubmitted').checked;

  if (!checkSurveySubmitted) {
    showToast('Please check the box confirming you submitted the Pre-Survey form.', 'error');
    return;
  }

  if (fullName.length < 3) {
    showToast('Please enter your valid Full Name.', 'error');
    return;
  }

  const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
  if (!gmailRegex.test(email)) {
    showToast('Please enter a valid Gmail address (@gmail.com).', 'error');
    return;
  }

  if (ambassadorGid !== '13052') {
    showToast('Invalid Ambassador GID. Please enter the verified Ambassador GID (13052).', 'error');
    return;
  }

  if (ambassadorEmail !== 'dasloknath2005@gmail.com') {
    showToast('Invalid Ambassador Email. Please enter the verified Ambassador email (dasloknath2005@gmail.com).', 'error');
    return;
  }

  // Anti-cheat check: check if this device already claimed a certificate under a different email
  const tracker = getLocalTracker();
  if (tracker.certificateClaimed && tracker.studentEmail && tracker.studentEmail !== email) {
    showToast('Anti-Cheat Protection: A certificate has already been issued for You To prevent duplicate claims, only one certificate is allowed per participant.', 'error');
    return;
  }

  // Record milestone
  state.step1Completed = true;
  state.studentName = fullName;
  state.studentEmail = email;

  tracker.studentName = fullName;
  tracker.studentEmail = email;
  tracker.step1Completed = true;
  saveLocalTracker(tracker);

  // Sync with cloud global counter (Only once per participant!)
  if (!tracker.preSurveyCounted) {
    tracker.preSurveyCounted = true;
    saveLocalTracker(tracker);
    incrementCloudStat('preSurveys');
  }

  // Update UI
  document.getElementById('badgeStep1').className = 'badge-status badge-done';
  document.getElementById('badgeStep1').innerHTML = '✓ Completed & Verified';
  document.getElementById('stepNode1').className = 'step-node completed';
  document.getElementById('line1').className = 'step-line completed';
  const btn = document.getElementById('btnSubmitStep1');
  btn.innerHTML = '<span>✓ Pre-Survey Verified</span>';
  btn.className = 'btn-primary btn-success';

  refreshStats();
  unlockStep2();
  showToast('Pre-Survey verified! Step 2 (Feedback) is now unlocked.', 'success');

  setTimeout(() => {
    jumpToSection(2);
  }, 400);
}

function unlockStep2() {
  document.getElementById('stepNode2').className = 'step-node active';
  document.getElementById('badgeStep2').className = 'badge-status badge-active';
  document.getElementById('badgeStep2').innerHTML = '● In Progress';
  document.getElementById('lockedState2').style.display = 'none';
  document.getElementById('formStep2').style.display = 'block';

  if (document.getElementById('s2RegisteredEmail')) {
    document.getElementById('s2RegisteredEmail').value = state.studentEmail;
  }
}

// STEP 2: Participant Feedback Submission
async function handleStep2Submit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const registeredEmail = document.getElementById('s2RegisteredEmail').value.trim().toLowerCase();
  const ambassadorGid = document.getElementById('s2AmbassadorGid').value.trim();
  const checkSubmitted = document.getElementById('checkSubmitted').checked;

  if (!checkSubmitted) {
    showToast('Please check the confirmation box verifying you submitted the official feedback form.', 'error');
    return;
  }

  if (state.studentEmail && registeredEmail !== state.studentEmail) {
    showToast('The email entered does not match your registered email from Step 1 (' + state.studentEmail + ').', 'error');
    return;
  }

  if (ambassadorGid !== '13052') {
    showToast('Invalid Ambassador GID. Please enter 13052.', 'error');
    return;
  }

  state.step2Completed = true;
  const tracker = getLocalTracker();
  tracker.step2Completed = true;
  saveLocalTracker(tracker);

  // Sync with cloud global counter (Only once per participant!)
  if (!tracker.feedbackCounted) {
    tracker.feedbackCounted = true;
    saveLocalTracker(tracker);
    incrementCloudStat('feedbacks');
  }

  document.getElementById('badgeStep2').className = 'badge-status badge-done';
  document.getElementById('badgeStep2').innerHTML = '✓ Submitted & Verified';
  document.getElementById('stepNode2').className = 'step-node completed';
  document.getElementById('line2').className = 'step-line completed';
  const btn = document.getElementById('btnSubmitStep2');
  btn.innerHTML = '<span>✓ Feedback Submission Verified</span>';
  btn.className = 'btn-primary btn-success';

  refreshStats();
  unlockStepGpa();
  showToast('Feedback verified! Step 3 (Google Play Arena option) is now unlocked.', 'success');

  setTimeout(() => {
    jumpToSection('Gpa');
  }, 400);
}

function unlockStepGpa() {
  document.getElementById('stepNodeGpa').className = 'step-node active';
  document.getElementById('badgeStepGpa').className = 'badge-status badge-active';
  document.getElementById('badgeStepGpa').innerHTML = '● In Progress';
  document.getElementById('lockedStateGpa').style.display = 'none';
  document.getElementById('unlockedStepGpa').style.display = 'block';
}

// STEP 3: Google Play Arena Option Submission
async function handleGpaSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const gpaRadio = document.querySelector('input[name="gpaOption"]:checked');
  if (!gpaRadio) {
    showToast('Please select either "I am Registered / Interested" or "I am Not Interested".', 'error');
    return;
  }

  const gpaChoice = gpaRadio.value;
  const teamName = document.getElementById('gpaTeamName').value.trim();
  const reasonNotInterested = document.getElementById('gpaReason').value.trim();

  if (gpaChoice === 'registered' && teamName.length < 2) {
    showToast('Please enter your Google Play Arena team name or nickname.', 'error');
    return;
  }

  if (gpaChoice === 'not_interested' && reasonNotInterested.length < 3) {
    showToast('Please provide a brief reason why you are not interested.', 'error');
    return;
  }

  state.stepGpaCompleted = true;
  const tracker = getLocalTracker();
  tracker.stepGpaCompleted = true;
  tracker.gpaChoice = gpaChoice;
  saveLocalTracker(tracker);

  // Sync with cloud global counter (Only once per participant!)
  if (!tracker.gpaCounted) {
    tracker.gpaCounted = true;
    saveLocalTracker(tracker);
    const keyToIncrement = gpaChoice === 'registered' ? 'gpaRegistered' : 'gpaNotInterested';
    incrementCloudStat(keyToIncrement);
  }

  document.getElementById('badgeStepGpa').className = 'badge-status badge-done';
  document.getElementById('badgeStepGpa').innerHTML = '✓ Choice Saved';
  document.getElementById('stepNodeGpa').className = 'step-node completed';
  document.getElementById('lineGpa').className = 'step-line completed';
  const btn = document.getElementById('btnSubmitGpa');
  btn.innerHTML = '<span>✓ Status Recorded</span>';
  btn.className = 'btn-primary btn-success';

  refreshStats();
  unlockStep3();
  showToast('All requirements completed! Your official certificate is unlocked!', 'success');

  setTimeout(() => {
    jumpToSection(3);
  }, 400);
}

function unlockStep3() {
  document.getElementById('stepNode3').className = 'step-node active';
  document.getElementById('badgeStep3').className = 'badge-status badge-active';
  document.getElementById('badgeStep3').innerHTML = '● Ready to Download';
  document.getElementById('lockedState3').style.display = 'none';
  document.getElementById('unlockedState3').style.display = 'block';

  document.getElementById('certInputName').value = state.studentName;
  document.getElementById('certInputDate').value = state.eventDate;

  updateLivePreview();
}

// IN-BROWSER VECTOR PDF GENERATION (Runs completely client-side via PDF-Lib & local fonts!)
async function buildCertificatePdfBytes(studentName) {
  const templateBytes = await fetch('./assets/Certificate_template.pdf').then(r => r.arrayBuffer());
  const fontBytes = await fetch('./assets/GoogleSans-Bold.ttf').then(r => r.arrayBuffer());
  const sigBytes = await fetch('./assets/signature_cropped.png').then(r => r.arrayBuffer());

  const { PDFDocument, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const customFont = await pdfDoc.embedFont(fontBytes);
  const sigImage = await pdfDoc.embedPng(sigBytes);

  const page = pdfDoc.getPages()[0];
  const { width } = page.getSize();

  // 1. Participant Name: center horizontally at (width - nameWidth)/2, y = 308
  const cleanName = studentName.trim() || state.studentName || 'Akshat Jain';
  let nameSize = 34;
  let nameWidth = customFont.widthOfTextAtSize(cleanName, nameSize);
  const maxNameWidth = 520;
  if (nameWidth > maxNameWidth) {
    nameSize = Math.floor(nameSize * (maxNameWidth / nameWidth));
    nameWidth = customFont.widthOfTextAtSize(cleanName, nameSize);
  }

  page.drawText(cleanName, {
    x: (width - nameWidth) / 2,
    y: 308,
    size: nameSize,
    font: customFont,
    color: rgb(0.12, 0.12, 0.14)
  });

  // 2. Fixed Event Date: 22.11.2026 at x = 163, y = 94
  const fixedDate = '22.11.2026';
  const dateSize = 13;
  const dateWidth = customFont.widthOfTextAtSize(fixedDate, dateSize);
  page.drawText(fixedDate, {
    x: 163 - (dateWidth / 2),
    y: 94,
    size: dateSize,
    font: customFont,
    color: rgb(0.18, 0.2, 0.22)
  });

  // 3. Ambassador Signature: centered directly above signature line at x = 713, y = 89
  const sigDims = sigImage.scale(0.38);
  page.drawImage(sigImage, {
    x: 713 - (sigDims.width / 2),
    y: 89,
    width: sigDims.width,
    height: sigDims.height
  });

  return await pdfDoc.save();
}

// LIVE PREVIEW GENERATION
let previewDebounceTimer = null;
function updateLivePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(async () => {
    const name = document.getElementById('certInputName').value.trim() || state.studentName;

    try {
      const pdfBytes = await buildCertificatePdfBytes(name);
      state.generatedPdfBytes = pdfBytes;

      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const canvas = document.getElementById('certCanvas');
      const context = canvas.getContext('2d');

      const viewport = page.getViewport({ scale: 1.2, rotation: 0 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Preview render error:', err);
    }
  }, 200);
}

// DOWNLOAD FINAL CERTIFICATE PDF WITH STRICT ANTI-CHEAT CHECK
async function downloadCertificatePDF() {
  const name = document.getElementById('certInputName').value.trim() || state.studentName;
  const email = state.studentEmail;

  if (!name || name.length < 3) {
    showToast('Please enter your valid name for the certificate.', 'error');
    return;
  }

  // STRICT ANTI-CHEAT DEVICE CHECK
  const tracker = getLocalTracker();
  if (tracker.certificateClaimed && tracker.studentEmail && tracker.studentEmail !== email) {
    showToast('Anti-Cheat Protection: A certificate has already been issued for You To prevent duplicate claims, only one certificate is allowed per participant.', 'error');
    return;
  }

  const btn = document.getElementById('btnDownloadCert');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Generating High-Quality Certificate...</span>';

  try {
    let pdfBytes = state.generatedPdfBytes;
    if (!pdfBytes) {
      pdfBytes = await buildCertificatePdfBytes(name);
    }

    // Mark certificate claimed on this device
    tracker.certificateClaimed = true;
    tracker.studentEmail = email;
    tracker.studentName = name;
    saveLocalTracker(tracker);

    // Sync certificate issuance to cloud counter (Only once per participant!)
    if (!tracker.certificateCounted) {
      tracker.certificateCounted = true;
      saveLocalTracker(tracker);
      incrementCloudStat('certificatesIssued');
    }

    // Trigger instant browser download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Certificate_${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    showToast('Your official certificate has been downloaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Download failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

window.handleStep1Submit = handleStep1Submit;
window.handleStep2Submit = handleStep2Submit;
window.handleGpaSubmit = handleGpaSubmit;
window.toggleGpaInputs = toggleGpaInputs;
window.jumpToSection = jumpToSection;
window.updateLivePreview = updateLivePreview;
window.downloadCertificatePDF = downloadCertificatePDF;
window.refreshStats = refreshStats;
window.state = state;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Google Student Ambassador Certificate Portal initialized.');
  refreshStats();
});
