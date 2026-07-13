import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Matches NOUN course codes like "CIT 403", "GST 101". Runs entirely in the
// browser -- the slip file itself is never sent anywhere.
const COURSE_CODE_REGEX = /\b([A-Z]{2,4})\s*(\d{3})\b/g;

export async function extractCourseCodesFromSlip(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(' ') + ' ';
  }

  const matches = [...fullText.matchAll(COURSE_CODE_REGEX)];
  return [...new Set(matches.map((m) => `${m[1]} ${m[2]}`))];
}
