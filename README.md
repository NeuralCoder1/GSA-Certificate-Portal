# Google Student Ambassador — Certificate Verification & Download Portal

A modern web application built for Google Student Ambassador events to verify participant survey submissions through a 3-section gated workflow and generate high-resolution personalized certificates in PDF format.

## Features
- **Authentic Google Material 3 UI**: Styled with Google brand colors, interactive hover animations, floating background glows, and official Google Gemini & GSA logos.
- **Strict Section-Wise Locking (3 Sections)**:
  - **Section 1 (Pre-Survey Form)**: Validates participant full name, `@gmail.com` address, Ambassador GID (`130****`), Ambassador Email (`dasxxxxx@gmail.com`), tool usage frequency, 0–10 confidence scale, and tool perception matrix. Section 2 remains locked until validated.
  - **Section 2 (Participant Feedback)**: Collects ratings for Gemini & Nano Banana along with constructive feedback (minimum 5 words) and peer recommendations.
  - **Section 3 (Certificate Generator & Downloader)**: Unlocks only upon completing both steps. Automatically populates the student name and event date with live canvas preview and instant vector PDF download.
- **Vector PDF Customization**:
  - Uses the official `Certificate of Participation.ai` vector PDF template.
  - Embeds your official `GoogleSans-Bold.ttf` font for student name and date.
  - Embeds your transparent authorized signature over the signature line.

## Quick Start
1. Double click `start_portal.bat` or run:
   ```bash
   node server.js
   ```
2. Open your browser at:
   ```
   http://localhost:3000
   ```
