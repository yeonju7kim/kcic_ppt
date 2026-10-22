import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileCheck2,
  Layers3,
  LoaderCircle,
  Plus,
  RotateCcw,
} from 'lucide-react';
import DocumentDropzone from './components/DocumentDropzone.jsx';
import ReferenceCard from './components/ReferenceCard.jsx';
import { ENGLISH_TRANSLATIONS, KOREAN_TRANSLATIONS } from './data/books.js';
import { COPY, getLanguage } from './i18n.js';
import { fetchPassages } from './lib/bible.js';
import { isSupportedDocument } from './lib/fileTypes.js';
import {
  cloneReference,
  extractReferences,
  formatReference,
} from './lib/references.js';

const EMPTY_SETTINGS = {
  titleEn: '',
  titleKo: '',
  mainPassage: '',
  defaultEnglish: 'NIV',
  defaultKorean: 'GAE',
  fileName: 'KCIC_Scripture_Slides',
};

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem('kcic-ppt-draft') || 'null');
    return saved ? { references: saved.references || [], settings: { ...EMPTY_SETTINGS, ...saved.settings } } : null;
  } catch {
    return null;
  }
}

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

function referenceKey(reference) {
  return `${reference.bookEn}:${reference.chapter}:${reference.verseStart}:${reference.verseEnd}`;
}

export default function App() {
  const draft = useMemo(loadDraft, []);
  const [language, setLanguage] = useState(getLanguage);
  const [references, setReferences] = useState(draft?.references || []);
  const [settings, setSettings] = useState(draft?.settings || EMPTY_SETTINGS);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceStatus, setSourceStatus] = useState({ kind: 'idle' });
  const [parsing, setParsing] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [selectedId, setSelectedId] = useState(draft?.references?.[0]?.id || null);
  const [copiedReference, setCopiedReference] = useState(null);
  const [notice, setNotice] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const c = COPY[language];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedReference = references.find((reference) => reference.id === selectedId) || null;
  const hasTitle = Boolean(settings.titleEn.trim() || settings.titleKo.trim());
  const verseSlides = references.reduce((sum, reference) => sum + reference.verseEnd - reference.verseStart + 1, 0);
  const slideCount = verseSlides + (hasTitle ? 1 : 0);
  const previewMainReference = useMemo(() => {
    if (settings.mainPassage.trim()) {
      return extractReferences(settings.mainPassage)[0] || null;
    }
    return references[0] || null;
  }, [references, settings.mainPassage]);
  const previewPassageFallback = settings.mainPassage.trim() || c.passage;

  useEffect(() => {
    localStorage.setItem('kcic-ppt-draft', JSON.stringify({ references, settings }));
  }, [references, settings]);

  useEffect(() => {
    localStorage.setItem('kcic-ppt-language', language);
    document.documentElement.lang = language;
    document.title = c.pageTitle;
  }, [c.pageTitle, language]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const insertReferences = useCallback((items, message) => {
    if (!items.length) return;
    setReferences((current) => {
      const selectedIndex = current.findIndex((reference) => reference.id === selectedId);
      const insertionIndex = selectedIndex >= 0 ? selectedIndex + 1 : current.length;
      return [...current.slice(0, insertionIndex), ...items, ...current.slice(insertionIndex)];
    });
    setSelectedId(items[items.length - 1].id);
    if (message) setNotice({ type: 'success', text: message });
  }, [selectedId]);

  const copyReference = useCallback((reference) => {
    setCopiedReference({ ...reference });
    navigator.clipboard?.writeText(formatReference(reference)).catch(() => {});
    setNotice({ type: 'success', text: c.copied(formatReference(reference, language)) });
  }, [c, language]);

  const pasteCopiedReference = useCallback(() => {
    if (!copiedReference) {
      setNotice({ type: 'info', text: c.copyFirst });
      return;
    }
    insertReferences([cloneReference(copiedReference)], c.pastedCopy);
  }, [c, copiedReference, insertReferences]);

  useEffect(() => {
    function handleCopy(event) {
      if (isTypingTarget(document.activeElement) || !selectedReference) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', formatReference(selectedReference, language));
      copyReference(selectedReference);
    }

    function handlePaste(event) {
      if (isTypingTarget(document.activeElement)) return;
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const parsed = extractReferences(pastedText, {
        englishTranslation: settings.defaultEnglish,
        koreanTranslation: settings.defaultKorean,
      });
      if (parsed.length) {
        event.preventDefault();
        insertReferences(parsed, c.pastedMany(parsed.length));
      } else if (copiedReference) {
        event.preventDefault();
        pasteCopiedReference();
      }
    }

    function handleKeyDown(event) {
      if (isTypingTarget(document.activeElement) || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'd' && selectedReference) {
        event.preventDefault();
        insertReferences([cloneReference(selectedReference)], c.duplicated);
      }
    }

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [c, copiedReference, copyReference, insertReferences, language, pasteCopiedReference, selectedReference, settings.defaultEnglish, settings.defaultKorean]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function handleFile(file) {
    if (!isSupportedDocument(file)) {
      setNotice({ type: 'error', text: c.unsupportedFile });
      return;
    }

    setSourceFile(file);
    setParsing(true);
    setSourceStatus({ kind: 'preparing' });
    try {
      const { extractTextFromFile } = await import('./lib/documents.js');
      const text = await extractTextFromFile(file, (textStatus) => setSourceStatus({ kind: 'progress', text: textStatus }), language);
      const extracted = extractReferences(text, {
        englishTranslation: settings.defaultEnglish,
        koreanTranslation: settings.defaultKorean,
      });
      const existingKeys = new Set(references.map(referenceKey));
      const newItems = extracted.filter((reference) => !existingKeys.has(referenceKey(reference)));
      if (newItems.length) {
        setReferences((current) => [...current, ...newItems]);
        setSelectedId(newItems[0].id);
      }
      const skipped = extracted.length - newItems.length;
      setSourceStatus({ kind: 'extracted', file: file.name, count: extracted.length, skipped });
      if (!extracted.length) {
        setNotice({
          type: 'info',
          text: file.name.toLowerCase().endsWith('.pdf')
            ? c.noPdfPassages
            : c.noPassages,
        });
      } else {
        setNotice({ type: 'success', text: c.imported(extracted.length) });
      }
      if (settings.fileName === EMPTY_SETTINGS.fileName) {
        updateSetting('fileName', file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (error) {
      setSourceStatus({ kind: 'failed' });
      setNotice({ type: 'error', text: error.message });
      setSourceFile(null);
    } finally {
      setParsing(false);
    }
  }

  function addQuickReferences() {
    const parsed = extractReferences(quickText, {
      englishTranslation: settings.defaultEnglish,
      koreanTranslation: settings.defaultKorean,
    });
    if (!parsed.length) {
      setNotice({ type: 'error', text: c.quickAddError });
      return;
    }
    insertReferences(parsed, c.addedMany(parsed.length));
    setQuickText('');
  }

  function updateReference(updated) {
    setReferences((current) => current.map((reference) => reference.id === updated.id ? updated : reference));
  }

  function removeReference(id) {
    setReferences((current) => {
      const index = current.findIndex((reference) => reference.id === id);
      const next = current.filter((reference) => reference.id !== id);
      if (id === selectedId) setSelectedId(next[Math.min(index, next.length - 1)]?.id || null);
      return next;
    });
  }

  function duplicateReference(reference) {
    setSelectedId(reference.id);
    const index = references.findIndex((item) => item.id === reference.id);
    const clone = cloneReference(reference);
    setReferences((current) => [...current.slice(0, index + 1), clone, ...current.slice(index + 1)]);
    setSelectedId(clone.id);
    setNotice({ type: 'success', text: c.duplicatedBelow });
  }

  function applyTranslationsToAll() {
    setReferences((current) => current.map((reference) => ({
      ...reference,
      englishTranslation: settings.defaultEnglish,
      koreanTranslation: settings.defaultKorean,
    })));
    setNotice({ type: 'success', text: c.appliedAll });
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setReferences((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  async function downloadPresentation() {
    if (!references.length) {
      setNotice({ type: 'error', text: c.needPassage });
      return;
    }

    let mainReference = references[0];
    if (hasTitle && settings.mainPassage.trim()) {
      [mainReference] = extractReferences(settings.mainPassage);
      if (!mainReference) {
        setNotice({ type: 'error', text: c.invalidTitlePassage });
        return;
      }
    }

    setGenerating(true);
    setProgress({ current: 0, total: 1, label: c.preparingBible });
    try {
      const passages = await fetchPassages(references, (current, total, reference) => {
        setProgress({ current, total, label: c.loadingBible(formatReference(reference, language)) });
      }, language);
      setProgress({ current: 1, total: 1, label: c.buildingPowerPoint });
      const { generatePresentation } = await import('./lib/presentation.js');
      const createdSlides = await generatePresentation({
        passages,
        titleEn: settings.titleEn.trim(),
        titleKo: settings.titleKo.trim(),
        mainReference,
        fileName: settings.fileName,
        language,
      });
      setNotice({ type: 'success', text: c.downloaded(createdSlides) });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || c.generationFailed });
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0, label: '' });
    }
  }

  function resetProject() {
    if (!window.confirm(c.resetConfirm)) return;
    setReferences([]);
    setSettings(EMPTY_SETTINGS);
    setSourceFile(null);
    setSourceStatus({ kind: 'idle' });
    setSelectedId(null);
    setCopiedReference(null);
    localStorage.removeItem('kcic-ppt-draft');
    setNotice({ type: 'info', text: c.resetDone });
  }

  const progressPercent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const sourceStatusText = sourceStatus.kind === 'idle'
    ? c.sourceIdle
    : sourceStatus.kind === 'preparing'
      ? c.sourcePreparing
      : sourceStatus.kind === 'extracted'
        ? c.sourceExtracted(sourceStatus.file, sourceStatus.count, sourceStatus.skipped)
        : sourceStatus.kind === 'failed'
          ? c.sourceFailed
          : sourceStatus.text;

  return (
    <div
      className={`app-shell lang-${language}`}
      style={{ '--template-background': `url("${import.meta.env.BASE_URL}assets/sermon-background.png")` }}
    >
      <header className="app-header">
        <div className="brand-copy">
          <strong>{c.brand}</strong>
        </div>
        <a className="tool-link" href="#/lyrics">Lyrics TXT</a>
        <div className="header-spacer" />
        <div className="language-switch" role="group" aria-label="Language">
          <button type="button" className={language === 'en' ? 'is-active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          <button type="button" className={language === 'ko' ? 'is-active' : ''} aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>한국어</button>
        </div>
        <button type="button" className="reset-button" onClick={resetProject}><RotateCcw size={15} /> {c.reset}</button>
      </header>

      <main>
        {notice && <div className={`notice notice-${notice.type}`} role="status">{notice.type === 'success' && <CheckCircle2 size={18} />}{notice.text}</div>}

        <div className="workspace">
          <aside className="settings-column">
            <section className="panel source-panel">
              <div className="panel-heading">
                <div><span className="section-number">01</span><h2>{c.sourceHeading}</h2></div>
                <span className="optional-label">{c.optional}</span>
              </div>
              <DocumentDropzone file={sourceFile} busy={parsing} onFile={handleFile} copy={c.dropzone} onClear={() => { setSourceFile(null); setSourceStatus({ kind: 'idle' }); }} />
              <p className="source-status"><FileCheck2 size={15} /> {sourceStatusText}</p>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div><span className="section-number">02</span><h2>{c.titleHeading}</h2></div>
                <span className="optional-label">{c.optional}</span>
              </div>
              <div className="form-stack">
                <label><span>{c.koreanTitle}</span><input value={settings.titleKo} onChange={(event) => updateSetting('titleKo', event.target.value)} placeholder={c.koreanTitlePlaceholder} /></label>
                <label><span>{c.englishTitle}</span><input value={settings.titleEn} onChange={(event) => updateSetting('titleEn', event.target.value)} placeholder={c.englishTitlePlaceholder} /></label>
                <label><span>{c.titlePassage}</span><input value={settings.mainPassage} onChange={(event) => updateSetting('mainPassage', event.target.value)} placeholder={c.titlePassagePlaceholder} /></label>
              </div>
              <p className="field-help">{c.titleHelp}</p>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div><span className="section-number">03</span><h2>{c.versionsHeading}</h2></div>
              </div>
              <div className="translation-grid">
                <label><span>{c.english}</span><select value={settings.defaultEnglish} onChange={(event) => updateSetting('defaultEnglish', event.target.value)}>{Object.entries(ENGLISH_TRANSLATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                <label><span>{c.korean}</span><select value={settings.defaultKorean} onChange={(event) => updateSetting('defaultKorean', event.target.value)}>{Object.entries(KOREAN_TRANSLATIONS).map(([code, label]) => <option key={code} value={code}>{language === 'en' ? `${code} · ${label}` : label}</option>)}</select></label>
              </div>
              <button type="button" className="text-button" onClick={applyTranslationsToAll} disabled={!references.length}>{c.applyAll}</button>
            </section>

            <section className="template-preview" aria-label={c.templatePreview}>
              <div className="preview-screen">
                <div className="preview-text">
                  <strong className={!settings.titleEn.trim() ? 'is-placeholder' : ''}>{settings.titleEn.trim() || c.englishTitle}</strong>
                  <span>{`(${previewMainReference ? formatReference(previewMainReference, 'en') : previewPassageFallback})`}</span>
                  <strong className={`preview-title-ko${!settings.titleKo.trim() ? ' is-placeholder' : ''}`}>{settings.titleKo.trim() || c.koreanTitle}</strong>
                  <span>{`(${previewMainReference ? formatReference(previewMainReference, 'ko') : previewPassageFallback})`}</span>
                </div>
              </div>
              <div><span>{c.templateName}</span><small>{c.templateDetail}</small></div>
            </section>
          </aside>

          <section className="verses-column">
            <div className="verses-header">
              <div>
                <span className="section-number">04</span>
                <h2>{c.blocksHeading}</h2>
                <p>{c.blocksHelp}</p>
              </div>
              <div className="list-tools">
                <button type="button" onClick={pasteCopiedReference} disabled={!copiedReference}><ClipboardPaste size={16} /> {c.paste}</button>
                <span>{c.blocksCount(references.length)}</span>
              </div>
            </div>

            <div className="quick-add">
              <div className="quick-add-icon"><Plus size={19} /></div>
              <label>
                <span>{c.quickAdd}</span>
                <input
                  value={quickText}
                  onChange={(event) => setQuickText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addQuickReferences(); } }}
                  placeholder={c.quickPlaceholder}
                />
              </label>
              <button type="button" className="primary-button compact" onClick={addQuickReferences}>{c.add}</button>
              <small>{selectedReference ? c.insertAfter(formatReference(selectedReference, language)) : c.insertEnd}</small>
            </div>

            {references.length ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={references.map((reference) => reference.id)} strategy={verticalListSortingStrategy}>
                  <div className="reference-list">
                    {references.map((reference, index) => (
                      <ReferenceCard
                        key={reference.id}
                        reference={reference}
                        index={index}
                        selected={reference.id === selectedId}
                        onSelect={() => setSelectedId(reference.id)}
                        onUpdate={updateReference}
                        onCopy={() => copyReference(reference)}
                        onDuplicate={() => duplicateReference(reference)}
                        onRemove={() => removeReference(reference.id)}
                        language={language}
                        copy={c.card}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="empty-state">
                <div><Layers3 size={28} /></div>
                <h3>{c.emptyTitle}</h3>
                <p>{c.emptyBody}</p>
                <span>{c.emptyNote}</span>
              </div>
            )}

            <div className="keyboard-hint">
              <span><kbd>Ctrl/Cmd</kbd> + <kbd>C</kbd> {c.shortcutCopy}</span>
              <span><kbd>Ctrl/Cmd</kbd> + <kbd>V</kbd> {c.shortcutPaste}</span>
              <span><kbd>Ctrl/Cmd</kbd> + <kbd>D</kbd> {c.shortcutDuplicate}</span>
            </div>
          </section>
        </div>
      </main>

      <div className="download-dock">
        <div className="download-summary">
          <span className="slide-total">{slideCount}</span>
          <div><strong>{c.expectedSlides}</strong><small>{c.slideSummary(hasTitle ? 1 : 0, verseSlides)}</small></div>
        </div>
        <label className="filename-field"><span>{c.fileName}</span><div><input value={settings.fileName} onChange={(event) => updateSetting('fileName', event.target.value)} /><b>.pptx</b></div></label>
        {generating && <div className="generation-progress"><div><span style={{ width: `${progressPercent}%` }} /></div><small>{progress.label}</small></div>}
        <button type="button" className="download-button" disabled={!references.length || generating} onClick={downloadPresentation}>
          {generating ? <LoaderCircle className="spin" size={20} /> : <Download size={20} />}
          {generating ? c.generating : c.download}
        </button>
      </div>

      <footer>
        <span>KCIC · KAIST-CNU International Chapel</span>
        <span>{c.footerPrivacy}</span>
      </footer>
    </div>
  );
}
