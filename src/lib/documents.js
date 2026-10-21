import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function extensionOf(file) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function messagesFor(language) {
  return language === 'ko' ? {
    pdfProgress: (page, total) => `PDF ${page}/${total}쪽 읽는 중…`,
    missingDocx: 'DOCX 문서 본문을 찾지 못했습니다.',
    invalidDocx: 'DOCX 문서 형식을 읽지 못했습니다.',
    docxProgress: 'DOCX 원고 읽는 중…',
    unsupported: 'DOCX, PDF, TXT 파일만 사용할 수 있습니다.',
  } : {
    pdfProgress: (page, total) => `Reading PDF page ${page} of ${total}…`,
    missingDocx: 'The DOCX document body could not be found.',
    invalidDocx: 'The DOCX document format could not be read.',
    docxProgress: 'Reading DOCX manuscript…',
    unsupported: 'Please choose a DOCX, PDF, or TXT file.',
  };
}

async function extractPdf(file, onProgress, messages) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress?.(messages.pdfProgress(pageNumber, document.numPages));
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

async function extractDocx(file, messages) {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = archive.file('word/document.xml');
  if (!documentFile) throw new Error(messages.missingDocx);

  const xml = await documentFile.async('string');
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw new Error(messages.invalidDocx);

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

export async function extractTextFromFile(file, onProgress, language = 'en') {
  const extension = extensionOf(file);
  const messages = messagesFor(language);

  if (extension === 'txt') return file.text();

  if (extension === 'docx') {
    onProgress?.(messages.docxProgress);
    return extractDocx(file, messages);
  }

  if (extension === 'pdf') return extractPdf(file, onProgress, messages);

  throw new Error(messages.unsupported);
}
