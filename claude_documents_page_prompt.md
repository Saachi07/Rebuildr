# Claude Prompt: Build Documents Page UX

Create a clean, simple **Documents Page** UI.

## Page Goal
This page lets users upload insurance/claim-related documents such as PDFs or scanned files, save them, analyze them using an AI wrapper, and view a simple summary, flagged issues, and deadlines.

## Layout Requirements

### 1. Upload Section at the Top
Create a large rounded rectangle upload box at the top of the page.

Inside the box, include:
- A PDF icon
- A scanned/image file icon
- Text that says: **“Drag & Drop PDF or Scanned Files Here”**
- Smaller text below: **“Or click to browse and select a file”**
- A small **Choose File** button or clickable file picker area

The upload box should support:
- Drag and drop upload
- Clicking the box to select a file
- PDF files
- Scanned image files

### 2. Buttons Under Upload Box
Directly below the upload box, add two horizontal buttons:

#### Button 1: Save Files
- Text: **“Save Files”**
- Secondary/outlined style
- Saves the uploaded files for later use

#### Button 2: Analyse Docs
- Text: **“✨ Analyse Docs (with AI)”**
- Primary blue style
- This button triggers the Gemini API wrapper
- It should analyze the uploaded file and generate a simple-language summary

### 3. Document Summary Section
Below the upload section, create a white card titled:

**Document Summary**

Inside it, show a simple paragraph summary of the uploaded document.

Example text:

> Based on the uploaded insurance document: This document explains your coverage, required proof, claim deadlines, and next steps. It also includes conditions that may affect your reimbursement.

Then include flagged warnings in red font. These should look important and easy to notice.

Example flagged lines:

- **MISSING:** Proof of ownership is not clearly attached.
- **UNRELIABLE DATA:** Claim submission deadline appears ambiguous.
- **ACTION REQUIRED:** Review damage assessment details before submitting.

### 4. Deadlines Section
Below the summary card, create another white card titled:

**Deadlines**

Inside it, add a simple table with two columns:

| Task | Date |
|---|---|
| Submit claim form | October 20, 2024 |
| Upload damage photos | October 25, 2024 |
| Finalize insurance paperwork | November 1, 2024 |

## Visual Style
- Clean, modern, beginner-friendly UI
- Light grey page background
- White cards with soft shadow
- Rounded corners
- Blue primary action button
- Red text only for warnings/flags
- Simple spacing and readable typography
- Keep it professional but not too complicated

## Functional Notes
- The **Analyse Docs** button should represent a Gemini API wrapper call.
- The AI should return:
  1. A simple-language document summary
  2. Flagged issues in red
  3. Extracted deadlines with task names and dates
- The page does not need to be legally perfect; it is a prototype UI for document understanding.

## Important UX Behavior
- If no file is uploaded and the user clicks **Analyse Docs**, show an error message like:
  **“Please upload a document first.”**
- While analysis is running, show a loading state like:
  **“Analyzing document…”**
- After analysis, display the summary, flags, and deadlines below.

## Output Expected
Generate the frontend code for this Documents Page.
Use clean component structure and readable variable names.
