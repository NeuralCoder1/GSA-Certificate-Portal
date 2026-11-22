const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path to assets
const TEMPLATE_PATH = path.join(__dirname, 'public', 'assets', 'Certificate_template.pdf');
const FONT_PATH = path.join(__dirname, 'public', 'assets', 'GoogleSans-Bold.ttf');
const SIGNATURE_PATH = path.join(__dirname, 'public', 'assets', 'signature_cropped.png');

// Store registered devices / fingerprint hashes & completed milestones
const DB_FILE = path.join(__dirname, 'submissions.json');
let db = {
  counts: {
    preSurveys: 0,
    feedbacks: 0,
    gpaRegistered: 0,
    gpaNotInterested: 0,
    certificatesIssued: 0
  },
  students: {}, // keyed by normalized email
  deviceTracker: {}, // keyed by device fingerprint to prevent multiple submissions from same device
  submissions: [],
  gpaResponses: []
};

if (fs.existsSync(DB_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (raw && typeof raw === 'object') {
      db = Object.assign(db, raw);
      if (!db.counts) {
        db.counts = { preSurveys: 0, feedbacks: 0, gpaRegistered: 0, gpaNotInterested: 0, certificatesIssued: 0 };
      }
      if (db.counts.gpaRegistrations !== undefined && db.counts.gpaRegistered === undefined) {
        db.counts.gpaRegistered = db.counts.gpaRegistrations;
        delete db.counts.gpaRegistrations;
      }
      if (db.counts.gpaNotInterested === undefined) db.counts.gpaNotInterested = 0;
      if (!db.students) db.students = {};
      if (!db.deviceTracker) db.deviceTracker = {};
      if (!db.submissions) db.submissions = [];
      if (!db.gpaResponses) db.gpaResponses = [];
    }
  } catch (e) {
    console.error('Failed reading DB file', e);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Failed saving DB file', e);
  }
}

// Helper to get client IP and device identifier
function getDeviceKey(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  const ua = req.headers['user-agent'] || 'unknown';
  const clientFp = req.body.deviceFingerprint || 'no-fp';
  return `${ip}__${clientFp}__${ua.slice(0, 30)}`;
}

// Endpoint: Live stats count
app.get('/api/stats', (req, res) => {
  return res.json({
    success: true,
    counts: db.counts
  });
});

// 1. Validation for Step 1 - Pre-Survey Form
app.post('/api/validate/step1', (req, res) => {
  const { fullName, email, ambassadorGid, ambassadorEmail, formConfirmed } = req.body;
  const devKey = getDeviceKey(req);
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!formConfirmed) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please confirm that you have submitted the Pre-Survey Form.' 
    });
  }

  if (!fullName || fullName.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Please enter a valid full name.' });
  }

  const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
  if (!cleanEmail || !gmailRegex.test(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid Gmail address (@gmail.com).' });
  }

  // Ambassador GID validation
  if (!ambassadorGid || ambassadorGid.toString().trim() !== '13052') {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid Ambassador GID. Please enter the verified Ambassador GID (13052).' 
    });
  }

  // Ambassador Email ID validation
  const ambEmailNorm = (ambassadorEmail || '').trim().toLowerCase();
  if (ambEmailNorm !== 'dasloknath2005@gmail.com') {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid Ambassador Email. Please enter the verified Ambassador email (dasloknath2005@gmail.com).' 
    });
  }

  // Anti-cheat device binding: check if this device was already used by a different person
  if (db.deviceTracker[devKey] && db.deviceTracker[devKey].certificateClaimed && db.deviceTracker[devKey].email !== cleanEmail) {
    return res.status(403).json({
      success: false,
      message: 'Anti-Cheat Protection: A certificate has already been issued for You To prevent duplicate claims, only one certificate is allowed per participant.'
    });
  }

  // STRICT SINGLE SUBMISSION: If this participant already submitted Step 1, do not recount
  let isNewSubmission = false;
  if (!db.students[cleanEmail]) {
    db.students[cleanEmail] = {
      fullName: fullName.trim(),
      email: cleanEmail,
      deviceKey: devKey,
      preSurveyCompleted: true,
      preSurveyConfirmedAt: new Date().toISOString(),
      feedbackCompleted: false,
      gpaChoice: null,
      gpaDetails: '',
      certificateClaimed: false
    };
    isNewSubmission = true;
  } else if (!db.students[cleanEmail].preSurveyCompleted) {
    db.students[cleanEmail].preSurveyCompleted = true;
    db.students[cleanEmail].preSurveyConfirmedAt = new Date().toISOString();
    isNewSubmission = true;
  }

  if (isNewSubmission) {
    db.counts.preSurveys = (db.counts.preSurveys || 0) + 1;
  }

  if (!db.deviceTracker[devKey]) db.deviceTracker[devKey] = {};
  db.deviceTracker[devKey].preSurveyCompleted = true;
  db.deviceTracker[devKey].email = cleanEmail;
  saveDb();

  return res.json({
    success: true,
    message: 'Pre-Survey Form verified! Step 2 (Participant Feedback) is now unlocked.',
    data: { fullName: fullName.trim(), email: cleanEmail, counts: db.counts }
  });
});

// 2. Validation for Step 2 - Participant Feedback Verification
app.post('/api/validate/step2', (req, res) => {
  const { 
    submissionConfirmed,
    registeredEmail,
    ambassadorGid
  } = req.body;
  const devKey = getDeviceKey(req);
  const cleanEmail = (registeredEmail || '').trim().toLowerCase();

  // Enforce prior step
  if (!db.students[cleanEmail] || !db.students[cleanEmail].preSurveyCompleted) {
    return res.status(400).json({
      success: false,
      message: 'Step 1 (Pre-Survey) must be completed with this registered email first.'
    });
  }

  if (!submissionConfirmed) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please confirm completion of the official Participant Feedback form.' 
    });
  }

  if (!ambassadorGid || ambassadorGid.toString().trim() !== '13052') {
    return res.status(400).json({ 
      success: false, 
      message: 'Please enter the verified Ambassador GID (13052).' 
    });
  }

  // STRICT SINGLE SUBMISSION: Only increment count on first submission
  if (!db.students[cleanEmail].feedbackCompleted) {
    db.students[cleanEmail].feedbackCompleted = true;
    db.students[cleanEmail].feedbackConfirmedAt = new Date().toISOString();
    db.counts.feedbacks = (db.counts.feedbacks || 0) + 1;
  }

  if (!db.deviceTracker[devKey]) db.deviceTracker[devKey] = {};
  db.deviceTracker[devKey].feedbackCompleted = true;
  saveDb();

  return res.json({
    success: true,
    message: 'Participant Feedback verified! Step 3 (Google Play Arena check) is now unlocked.',
    data: { counts: db.counts }
  });
});

// 3. Validation for Step 3 - Google Play Arena (GPA) Choice & Registration
app.post('/api/validate/gpa', (req, res) => {
  const { registeredEmail, gpaChoice, teamName, reasonNotInterested } = req.body;
  const devKey = getDeviceKey(req);
  const cleanEmail = (registeredEmail || '').trim().toLowerCase();

  // Enforce Step 2 completed first
  if (!db.students[cleanEmail] || !db.students[cleanEmail].feedbackCompleted) {
    return res.status(400).json({
      success: false,
      message: 'Please complete Step 2 (Participant Feedback) before this step.'
    });
  }

  if (gpaChoice !== 'registered' && gpaChoice !== 'not_interested') {
    return res.status(400).json({
      success: false,
      message: 'Please select whether you are registered or not interested in Google Play Arena.'
    });
  }

  // If registered: Ask for team name
  if (gpaChoice === 'registered') {
    if (!teamName || teamName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your Google Play Arena Team Name.'
      });
    }
  }

  // If not interested: Ask why
  if (gpaChoice === 'not_interested') {
    if (!reasonNotInterested || reasonNotInterested.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please let us know briefly why you are not interested.'
      });
    }
  }

  const prevChoice = db.students[cleanEmail].gpaChoice;
  const isNewGpaResponse = !prevChoice;

  db.students[cleanEmail].gpaChoice = gpaChoice;
  db.students[cleanEmail].gpaDetails = gpaChoice === 'registered' ? teamName.trim() : reasonNotInterested.trim();
  db.students[cleanEmail].gpaAnsweredAt = new Date().toISOString();

  // STRICT SINGLE SUBMISSION: Only increment count once per participant
  if (isNewGpaResponse) {
    if (gpaChoice === 'registered') {
      db.counts.gpaRegistered = (db.counts.gpaRegistered || 0) + 1;
    } else {
      db.counts.gpaNotInterested = (db.counts.gpaNotInterested || 0) + 1;
    }
  }

  db.gpaResponses.push({
    email: cleanEmail,
    fullName: db.students[cleanEmail].fullName,
    choice: gpaChoice,
    detail: db.students[cleanEmail].gpaDetails,
    timestamp: new Date().toISOString()
  });

  if (!db.deviceTracker[devKey]) db.deviceTracker[devKey] = {};
  db.deviceTracker[devKey].gpaCompleted = true;
  saveDb();

  return res.json({
    success: true,
    message: 'Response recorded! Step 4 (Certificate Download) is now unlocked.',
    data: { 
      counts: db.counts,
      studentName: db.students[cleanEmail].fullName,
      studentEmail: cleanEmail
    }
  });
});

// 4. Generate & Download Customized Certificate PDF
app.post('/api/certificate/generate', async (req, res) => {
  try {
    const { fullName, eventDate, email } = req.body;
    const devKey = getDeviceKey(req);
    const cleanEmail = (email || '').trim().toLowerCase();

    // STRICT ANTI-CHEAT: Ensure this device has NOT already generated a certificate for another email
    if (db.deviceTracker[devKey] && db.deviceTracker[devKey].certificateClaimed) {
      if (db.deviceTracker[devKey].email && db.deviceTracker[devKey].email !== cleanEmail) {
        return res.status(403).json({
          success: false,
          message: 'Anti-Cheat Protection: A certificate has already been issued for You To prevent duplicate claims, only one certificate is allowed per participant.'
        });
      }
    }

    // Ensure student completed GPA selection
    if (cleanEmail && db.students[cleanEmail] && !db.students[cleanEmail].gpaChoice) {
      return res.status(400).json({
        success: false,
        message: 'Please complete Step 3 (Google Play Arena option) before downloading your certificate.'
      });
    }

    if (!fullName || fullName.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Please enter a valid student name for the certificate.' });
    }

    if (!eventDate || !eventDate.trim()) {
      return res.status(400).json({ success: false, message: 'Please specify the event date.' });
    }

    const cleanName = fullName.trim();
    const cleanDate = eventDate.trim();

    // Load assets
    const templateBytes = fs.readFileSync(TEMPLATE_PATH);
    const fontBytes = fs.readFileSync(FONT_PATH);
    const sigBytes = fs.readFileSync(SIGNATURE_PATH);

    // Create PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    const customFont = await pdfDoc.embedFont(fontBytes);
    const sigImage = await pdfDoc.embedPng(sigBytes);

    const page = pdfDoc.getPages()[0];
    const { width } = page.getSize();

    // 1. Participant Name: Center horizontally above the line (y = 308)
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

    // 2. Event Date: Fixed to 22.11.2026. Placed centered directly above the Date placeholder line (center = 163, y = 94)
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

    // 3. Ambassador Signature: Placed centered directly above the Signature placeholder line (center = 713, y = 89)
    const sigDims = sigImage.scale(0.38);
    page.drawImage(sigImage, {
      x: 713 - (sigDims.width / 2),
      y: 89,
      width: sigDims.width,
      height: sigDims.height
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();

    // Record certificate issue and bind device strictly
    if (cleanEmail && db.students[cleanEmail]) {
      if (!db.students[cleanEmail].certificateClaimed) {
        db.students[cleanEmail].certificateClaimed = true;
        db.counts.certificatesIssued = (db.counts.certificatesIssued || 0) + 1;
      }
    } else {
      db.counts.certificatesIssued = (db.counts.certificatesIssued || 0) + 1;
    }

    if (!db.deviceTracker[devKey]) db.deviceTracker[devKey] = {};
    db.deviceTracker[devKey].certificateClaimed = true;
    db.deviceTracker[devKey].email = cleanEmail;

    db.submissions.push({
      fullName: cleanName,
      date: cleanDate,
      email: cleanEmail,
      deviceKey: devKey,
      timestamp: new Date().toISOString()
    });
    saveDb();

    // Send PDF file buffer
    const safeFilename = `Certificate_${cleanName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Certificate generation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate certificate: ' + error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`✨ Google Student Ambassador Certificate Portal is running`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
