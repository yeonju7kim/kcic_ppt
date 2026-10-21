import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function extensionOf(file) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

async function extractPdf(file, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress?.(`PDF ${pageNumber}/${document.numPages}쪽 읽는 중…`);
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      pageText += item.str;
      pageText += item.hasEOL ? '\n' : ' ';
    }
    pages.push(pageText.trim());
  }

  return pages.join('\n\n');
}

async function extractDocx(file) {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = archive.file('word/document.xml');
  if (!documentFile) throw new Error('DOCX 문서 본문을 찾지 못했습니다.');

  const xml = await documentFile.async('string');
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw new Error('DOCX 문서 형식을 읽지 못했습니다.');

  const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = [...documentXml.getElementsByTagNameNS(wordNamespace, 'p')];
  return paragraphs.map((paragraph) => {
    let text = '';
    const walker = documentXml.createTreeWalker(paragraph, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.localName === 't') text += node.textContent || '';
      if (node.localName === 'tab') text += '\t';
      if (node.localName === 'br' || node.localName === 'cr') text += '\n';
      node = walker.nextNode();
    }
    return text;
  }).join('\n');
}

export async function extractTextFromFile(file, onProgress) {
  const extension = extensionOf(file);

  if (extension === 'txt') return file.text();

  if (extension === 'docx') {
    onProgress?.('DOCX 원고 읽는 중…');
    return extractDocx(file);
  }

  if (extension === 'pdf') return extractPdf(file, onProgress);

  throw new Error('DOCX, PDF, TXT 파일만 사용할 수 있습니다.');
}
