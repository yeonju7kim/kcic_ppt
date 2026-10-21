import pptxgen from 'pptxgenjs';
import { formatReference } from './references.js';

const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const FONT = 'Malgun Gothic';
let backgroundDataPromise;

function loadBackground(language) {
  if (!backgroundDataPromise) {
    backgroundDataPromise = fetch(`${import.meta.env.BASE_URL}assets/sermon-background.png`)
      .then((response) => {
        if (!response.ok) throw new Error(language === 'ko' ? 'PPT 배경 이미지를 불러오지 못했습니다.' : 'The PPT background image could not be loaded.');
        return response.blob();
      })
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }
  return backgroundDataPromise;
}

function addBackground(slide, background) {
  slide.addImage({ data: background, x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT });
}

function addTitleSlide(presentation, background, options) {
  const slide = presentation.addSlide();
  addBackground(slide, background);
  const common = { x: 1.14, w: 11.05, margin: 0, align: 'center', color: '172D2B', fontFace: FONT };
  slide.addText(options.titleEn || '', { ...common, y: 2.32, h: 0.56, fontSize: 30, bold: true, fit: 'shrink' });
  slide.addText(`(${formatReference(options.mainReference, 'en')})`, { ...common, y: 2.88, h: 0.48, fontSize: 24, bold: true, fit: 'shrink' });
  slide.addText(options.titleKo || '', { ...common, y: 3.54, h: 0.58, fontSize: 27, fit: 'shrink' });
  slide.addText(`(${formatReference(options.mainReference, 'ko')})`, { ...common, y: 4.12, h: 0.48, fontSize: 23, fit: 'shrink' });
}

function addVerseText(slide, verse, x, y, w, h) {
  slide.addText([
    { text: String(verse.number), options: { superscript: true } },
    { text: ` ${verse.text}` },
  ], {
    x,
    y,
    w,
    h,
    margin: 0,
    fontFace: FONT,
    fontSize: 24,
    color: '172D2B',
    breakLine: false,
    valign: 'top',
    fit: 'shrink',
    lineSpacingMultiple: 1.0,
  });
}

function addVerseSlide(presentation, background, reference, englishVerse, koreanVerse) {
  const slide = presentation.addSlide();
  addBackground(slide, background);
  slide.addShape(presentation.ShapeType.rect, {
    x: 0,
    y: 5.604,
    w: 4.458,
    h: 1.688,
    fill: { color: 'D5EFEB' },
    line: { color: 'D5EFEB', transparency: 100 },
  });

  const textOptions = {
    x: 0.405,
    w: 12.1,
    margin: 0,
    fontFace: FONT,
    color: '172D2B',
    fit: 'shrink',
  };
  slide.addText(formatReference(reference, 'en'), {
    ...textOptions,
    y: 0.42,
    h: 0.46,
    fontSize: 24,
    bold: true,
  });
  addVerseText(slide, englishVerse, 0.405, 0.98, 12.1, 1.9);
  slide.addText(formatReference(reference, 'ko'), {
    ...textOptions,
    y: 3.28,
    h: 0.46,
    fontSize: 24,
    bold: true,
  });
  addVerseText(slide, koreanVerse, 0.405, 3.84, 12.1, 2.04);
}

export async function generatePresentation({ passages, titleEn, titleKo, mainReference, fileName, language = 'en' }) {
  const background = await loadBackground(language);
  const presentation = new pptxgen();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'KCIC';
  presentation.company = 'KAIST-CNU International Chapel';
  presentation.subject = 'Sermon Bible passages';
  presentation.title = titleKo || titleEn || (language === 'ko' ? 'KCIC 말씀 슬라이드' : 'KCIC Scripture Slides');
  presentation.lang = 'ko-KR';
  presentation.theme = {
    headFontFace: FONT,
    bodyFontFace: FONT,
    lang: 'ko-KR',
  };

  if ((titleEn || '').trim() || (titleKo || '').trim()) {
    addTitleSlide(presentation, background, { titleEn, titleKo, mainReference });
  }

  for (const passage of passages) {
    for (let index = 0; index < passage.english.length; index += 1) {
      addVerseSlide(
        presentation,
        background,
        passage.reference,
        passage.english[index],
        passage.korean[index],
      );
    }
  }

  const safeName = (fileName || (language === 'ko' ? 'KCIC_말씀_슬라이드' : 'KCIC_Scripture_Slides'))
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\.pptx$/i, '');
  await presentation.writeFile({ fileName: `${safeName}.pptx` });
  return presentation._slides.length;
}
