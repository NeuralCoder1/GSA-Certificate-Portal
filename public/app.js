// Client-side Application Logic for GSA Certificate Portal

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

// State tracker
const state = {
  step1Completed: false, // Pre-Survey
  step2Completed: false, // Participant Feedback
  stepGpaCompleted: false, // Google Play Arena Option
  studentName: '',
  studentEmail: '',
  eventDate: '22.11.2026',
  currentActiveStep: 1,
  gpaChoice: null
};

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

// Update stats from server
async function refreshStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data && data.counts) {
      if (document.getElementById('statPreSurveys')) document.getElementById('statPreSurveys').innerText = data.counts.preSurveys || 0;
      if (document.getElementById('statFeedbacks')) document.getElementById('statFeedbacks').innerText = data.counts.feedbacks || 0;
      if (document.getElementById('statGpaRegistered')) document.getElementById('statGpaRegistered').innerText = data.counts.gpaRegistered || 0;
      if (document.getElementById('statGpaNotInterested')) document.getElementById('statGpaNotInterested').innerText = data.counts.gpaNotInterested || 0;
      if (document.getElementById('statCertificates')) document.getElementById('statCertificates').innerText = data.counts.certificatesIssued || 0;
    }
  } catch (e) {}
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
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
  }, 4000);
}

// Option selector helper for styled pills
function selectOption(containerId, element) {
  const container = document.getElementById(containerId);
  const buttons = container.querySelectorAll('.option-btn');
  buttons.forEach(btn => btn.classList.remove('selected'));
  element.classList.add('selected');
}

// Scale selector for 0-10
function selectScale(element) {
  const container = document.getElementById('scaleContainer');
  const buttons = container.querySelectorAll('.scale-btn');
  buttons.forEach(btn => btn.classList.remove('selected'));
  element.classList.add('selected');
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
  const email = document.getElementById('s1Email').value.trim();
  const ambassadorGid = document.getElementById('s1AmbassadorGid').value.trim();
  const ambassadorEmail = document.getElementById('s1AmbassadorEmail').value.trim();
  const checkSurveySubmitted = document.getElementById('checkSurveySubmitted').checked;

  if (!checkSurveySubmitted) {
    showToast('Please check the box confirming you submitted the Pre-Survey form.', 'error');
    return;
  }

  const payload = {
    fullName,
    email,
    ambassadorGid,
    ambassadorEmail,
    formConfirmed: true,
    deviceFingerprint
  };

  const btn = document.getElementById('btnSubmitStep1');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Verifying pre-survey submission...</span>';

  try {
    const res = await fetch('/api/validate/step1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Validation failed. Check your inputs.', 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    // Step 1 Success!
    state.step1Completed = true;
    state.studentName = fullName;
    state.studentEmail = email;

    document.getElementById('badgeStep1').className = 'badge-status badge-done';
    document.getElementById('badgeStep1').innerHTML = '✓ Completed & Verified';
    document.getElementById('stepNode1').className = 'step-node completed';
    document.getElementById('line1').className = 'step-line completed';
    btn.innerHTML = '<span>✓ Pre-Survey Verified</span>';
    btn.className = 'btn-primary btn-success';

    refreshStats();

    // Unlock Step 2
    unlockStep2();
    showToast('Pre-Survey verified! Step 2 (Feedback) is now unlocked.', 'success');

    setTimeout(() => {
      jumpToSection(2);
    }, 400);
  } catch (err) {
    console.error(err);
    showToast('Server connection error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
  }
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

  const registeredEmail = document.getElementById('s2RegisteredEmail').value.trim();
  const ambassadorGid = document.getElementById('s2AmbassadorGid').value.trim();
  const checkSubmitted = document.getElementById('checkSubmitted').checked;

  if (!checkSubmitted) {
    showToast('Please check the confirmation box verifying you submitted the official feedback form.', 'error');
    return;
  }

  if (state.studentEmail && registeredEmail.toLowerCase() !== state.studentEmail.toLowerCase()) {
    showToast('The email entered does not match your registered email from Step 1 (' + state.studentEmail + ').', 'error');
    return;
  }

  const payload = {
    submissionConfirmed: true,
    registeredEmail,
    ambassadorGid,
    deviceFingerprint
  };

  const btn = document.getElementById('btnSubmitStep2');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Verifying feedback submission...</span>';

  try {
    const res = await fetch('/api/validate/step2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Feedback verification failed.', 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    // Step 2 Success!
    state.step2Completed = true;

    document.getElementById('badgeStep2').className = 'badge-status badge-done';
    document.getElementById('badgeStep2').innerHTML = '✓ Submitted & Verified';
    document.getElementById('stepNode2').className = 'step-node completed';
    document.getElementById('line2').className = 'step-line completed';
    btn.innerHTML = '<span>✓ Feedback Submission Verified</span>';
    btn.className = 'btn-primary btn-success';

    refreshStats();

    // Unlock Step 3 (Google Play Arena status)
    unlockStepGpa();
    showToast('Feedback verified! Step 3 (Google Play Arena option) is now unlocked.', 'success');

    setTimeout(() => {
      jumpToSection('Gpa');
    }, 400);
  } catch (err) {
    console.error(err);
    showToast('Server connection error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
  }
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

  const payload = {
    registeredEmail: state.studentEmail,
    gpaChoice,
    teamName,
    reasonNotInterested,
    deviceFingerprint
  };

  const btn = document.getElementById('btnSubmitGpa');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Recording your choice...</span>';

  try {
    const res = await fetch('/api/validate/gpa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to submit response.', 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    state.stepGpaCompleted = true;

    document.getElementById('badgeStepGpa').className = 'badge-status badge-done';
    document.getElementById('badgeStepGpa').innerHTML = '✓ Choice Saved';
    document.getElementById('stepNodeGpa').className = 'step-node completed';
    document.getElementById('lineGpa').className = 'step-line completed';
    btn.innerHTML = '<span>✓ Status Recorded</span>';
    btn.className = 'btn-primary btn-success';

    refreshStats();

    // Unlock Step 4 (Certificate Download)
    unlockStep3();
    showToast('All requirements completed! Your official certificate is unlocked!', 'success');

    setTimeout(() => {
      jumpToSection(3);
    }, 400);
  } catch (err) {
    console.error(err);
    showToast('Server connection error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function unlockStep3() {
  document.getElementById('stepNode3').className = 'step-node active';
  document.getElementById('badgeStep3').className = 'badge-status badge-active';
  document.getElementById('badgeStep3').innerHTML = '● Ready to Download';
  document.getElementById('lockedState3').style.display = 'none';
  document.getElementById('unlockedState3').style.display = 'block';

  // Fill in student name
  document.getElementById('certInputName').value = state.studentName;
  document.getElementById('certInputDate').value = state.eventDate;

  // Render initial live canvas preview
  updateLivePreview();
}

// LIVE PREVIEW GENERATION USING PDF-LIB & PDF.JS
let previewDebounceTimer = null;
function updateLivePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(async () => {
    const name = document.getElementById('certInputName').value.trim() || state.studentName;
    const date = document.getElementById('certInputDate').value.trim() || state.eventDate;

    try {
      const res = await fetch('/api/certificate/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name, eventDate: date, email: state.studentEmail })
      });

      if (!res.ok) {
        console.error('Failed to preview certificate');
        return;
      }

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
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
  }, 250);
}

// DOWNLOAD FINAL CERTIFICATE PDF
async function downloadCertificatePDF() {
  const name = document.getElementById('certInputName').value.trim();
  const date = document.getElementById('certInputDate').value.trim();

  if (!name || name.length < 3) {
    showToast('Please enter your valid name for the certificate.', 'error');
    return;
  }
  if (!date) {
    showToast('Please enter event date.', 'error');
    return;
  }

  const btn = document.getElementById('btnDownloadCert');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Generating High-Quality Certificate...</span>';

  try {
    const res = await fetch('/api/certificate/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: name, eventDate: date, email: state.studentEmail })
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.message || 'Failed to generate certificate', 'error');
      return;
    }

    const blob = await res.blob();
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
window.selectOption = selectOption;
window.selectScale = selectScale;
window.jumpToSection = jumpToSection;
window.updateLivePreview = updateLivePreview;
window.downloadCertificatePDF = downloadCertificatePDF;
window.refreshStats = refreshStats;
window.state = state;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Google Student Ambassador Certificate Portal initialized.');
  refreshStats();
});
