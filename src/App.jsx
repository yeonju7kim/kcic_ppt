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
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import DocumentDropzone from './components/DocumentDropzone.jsx';
import ReferenceCard from './components/ReferenceCard.jsx';
import { ENGLISH_TRANSLATIONS, KOREAN_TRANSLATIONS } from './data/books.js';
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
  fileName: 'KCIC_말씀_슬라이드',
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
  const [references, setReferences] = useState(draft?.references || []);
  const [settings, setSettings] = useState(draft?.settings || EMPTY_SETTINGS);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceStatus, setSourceStatus] = useState('원고 없이 바로 시작할 수 있습니다.');
  const [parsing, setParsing] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [selectedId, setSelectedId] = useState(draft?.references?.[0]?.id || null);
  const [copiedReference, setCopiedReference] = useState(null);
  const [notice, setNotice] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedReference = references.find((reference) => reference.id === selectedId) || null;
  const hasTitle = Boolean(settings.titleEn.trim() || settings.titleKo.trim());
  const verseSlides = references.reduce((sum, reference) => sum + reference.verseEnd - reference.verseStart + 1, 0);
  const slideCount = verseSlides + (hasTitle ? 1 : 0);

  useEffect(() => {
    localStorage.setItem('kcic-ppt-draft', JSON.stringify({ references, settings }));
  }, [references, settings]);

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
    setNotice({ type: 'success', text: `${formatReference(reference)} 블록을 복사했습니다.` });
  }, []);

  const pasteCopiedReference = useCallback(() => {
    if (!copiedReference) {
      setNotice({ type: 'info', text: '먼저 구절 블록의 복사 버튼을 눌러주세요.' });
      return;
    }
    insertReferences([cloneReference(copiedReference)], '복사한 블록을 선택 위치 아래에 붙였습니다.');
  }, [copiedReference, insertReferences]);

  useEffect(() => {
    function handleCopy(event) {
      if (isTypingTarget(document.activeElement) || !selectedReference) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', formatReference(selectedReference));
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
        insertReferences(parsed, `${parsed.length}개 구절을 붙여넣었습니다.`);
      } else if (copiedReference) {
        event.preventDefault();
        pasteCopiedReference();
      }
    }

    function handleKeyDown(event) {
      if (isTypingTarget(document.activeElement) || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'd' && selectedReference) {
        event.preventDefault();
        insertReferences([cloneReference(selectedReference)], '선택한 블록을 복제했습니다.');
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
  }, [copiedReference, copyReference, insertReferences, pasteCopiedReference, selectedReference, settings.defaultEnglish, settings.defaultKorean]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function handleFile(file) {
    if (!isSupportedDocument(file)) {
      setNotice({ type: 'error', text: 'DOCX, PDF, TXT 파일만 사용할 수 있습니다.' });
      return;
    }

    setSourceFile(file);
    setParsing(true);
    setSourceStatus('원고 분석을 준비하는 중…');
    try {
      const { extractTextFromFile } = await import('./lib/documents.js');
      const text = await extractTextFromFile(file, setSourceStatus);
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
      const detail = skipped ? ` · 중복 ${skipped}개 제외` : '';
      setSourceStatus(`${file.name}에서 구절 ${extracted.length}개를 찾았습니다${detail}.`);
      if (!extracted.length) {
        setNotice({
          type: 'info',
          text: file.name.toLowerCase().endsWith('.pdf')
            ? '구절을 찾지 못했습니다. 스캔 PDF라면 텍스트 인식이 되지 않을 수 있어요. 아래에서 직접 추가할 수 있습니다.'
            : '구절을 찾지 못했습니다. 아래 입력창에서 직접 추가해 주세요.',
        });
      } else {
        setNotice({ type: 'success', text: `원고에서 구절 ${extracted.length}개를 가져왔습니다.` });
      }
      if (settings.fileName === EMPTY_SETTINGS.fileName) {
        updateSetting('fileName', file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (error) {
      setSourceStatus('원고를 읽지 못했습니다.');
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
      setNotice({ type: 'error', text: '예: 요 3:16-17, 롬 8:28처럼 입력해 주세요.' });
      return;
    }
    insertReferences(parsed, `${parsed.length}개 구절을 선택 위치 아래에 추가했습니다.`);
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
    setNotice({ type: 'success', text: '블록을 바로 아래에 복제했습니다.' });
  }

  function applyTranslationsToAll() {
    setReferences((current) => current.map((reference) => ({
      ...reference,
      englishTranslation: settings.defaultEnglish,
      koreanTranslation: settings.defaultKorean,
    })));
    setNotice({ type: 'success', text: '모든 블록에 기본 역본을 적용했습니다.' });
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
      setNotice({ type: 'error', text: 'PPT에 넣을 성경구절을 하나 이상 추가해 주세요.' });
      return;
    }

    let mainReference = references[0];
    if (hasTitle && settings.mainPassage.trim()) {
      [mainReference] = extractReferences(settings.mainPassage);
      if (!mainReference) {
        setNotice({ type: 'error', text: '타이틀 본문을 인식하지 못했습니다. 예: 히 2:1' });
        return;
      }
    }

    setGenerating(true);
    setProgress({ current: 0, total: 1, label: '성경 본문을 준비하는 중…' });
    try {
      const passages = await fetchPassages(references, (current, total, reference) => {
        setProgress({ current, total, label: `${formatReference(reference)} 본문 불러오는 중…` });
      });
      setProgress({ current: 1, total: 1, label: 'PowerPoint 파일을 만드는 중…' });
      const { generatePresentation } = await import('./lib/presentation.js');
      const createdSlides = await generatePresentation({
        passages,
        titleEn: settings.titleEn.trim(),
        titleKo: settings.titleKo.trim(),
        mainReference,
        fileName: settings.fileName,
      });
      setNotice({ type: 'success', text: `${createdSlides}장짜리 PPT를 다운로드했습니다.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'PPT 생성 중 오류가 발생했습니다.' });
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0, label: '' });
    }
  }

  function resetProject() {
    if (!window.confirm('현재 구절 목록과 설정을 모두 지울까요?')) return;
    setReferences([]);
    setSettings(EMPTY_SETTINGS);
    setSourceFile(null);
    setSourceStatus('원고 없이 바로 시작할 수 있습니다.');
    setSelectedId(null);
    setCopiedReference(null);
    localStorage.removeItem('kcic-ppt-draft');
    setNotice({ type: 'info', text: '새 작업을 시작합니다.' });
  }

  const progressPercent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div
      className="app-shell"
      style={{ '--template-background': `url("${import.meta.env.BASE_URL}assets/sermon-background.png")` }}
    >
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="brand-copy">
          <strong>KCIC 말씀 슬라이드</strong>
          <span>SERMON PPT STUDIO</span>
        </div>
        <div className="header-spacer" />
        <div className="privacy-chip"><ShieldCheck size={15} /> 원고는 업로드되지 않아요</div>
        <button type="button" className="reset-button" onClick={resetProject}><RotateCcw size={15} /> 초기화</button>
      </header>

      <main>
        <section className="intro-row">
          <div>
            <span className="eyebrow"><Sparkles size={15} /> 더 빠른 설교 준비</span>
            <h1>원고가 없어도,<br />구절만 골라 바로 PPT로.</h1>
            <p>DOCX·PDF·TXT에서 구절을 자동으로 찾거나 직접 추가하세요. 순서는 드래그하고, 블록은 복사해서 원하는 곳에 붙일 수 있습니다.</p>
          </div>
          <ol className="workflow-steps" aria-label="작업 순서">
            <li className="is-done"><span>1</span><div><strong>원고·설정</strong><small>선택 사항</small></div></li>
            <li className={references.length ? 'is-done' : 'is-current'}><span>2</span><div><strong>구절 정리</strong><small>{references.length}개 블록</small></div></li>
            <li className={references.length ? 'is-current' : ''}><span>3</span><div><strong>PPT 받기</strong><small>{slideCount}장 예상</small></div></li>
          </ol>
        </section>

        {notice && <div className={`notice notice-${notice.type}`} role="status">{notice.type === 'success' && <CheckCircle2 size={18} />}{notice.text}</div>}

        <div className="workspace">
          <aside className="settings-column">
            <section className="panel source-panel">
              <div className="panel-heading">
                <div><span className="section-number">01</span><h2>원고 가져오기</h2></div>
                <span className="optional-label">선택</span>
              </div>
              <DocumentDropzone file={sourceFile} busy={parsing} onFile={handleFile} onClear={() => { setSourceFile(null); setSourceStatus('원고 없이 바로 시작할 수 있습니다.'); }} />
              <p className="source-status"><FileCheck2 size={15} /> {sourceStatus}</p>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div><span className="section-number">02</span><h2>제목 슬라이드</h2></div>
                <span className="optional-label">선택</span>
              </div>
              <div className="form-stack">
                <label><span>한글 제목</span><input value={settings.titleKo} onChange={(event) => updateSetting('titleKo', event.target.value)} placeholder="예: 마음을 지키는 믿음" /></label>
                <label><span>영문 제목</span><input value={settings.titleEn} onChange={(event) => updateSetting('titleEn', event.target.value)} placeholder="예: A Faith That Guards the Heart" /></label>
                <label><span>타이틀 본문</span><input value={settings.mainPassage} onChange={(event) => updateSetting('mainPassage', event.target.value)} placeholder="비우면 첫 구절 자동 사용" /></label>
              </div>
              <p className="field-help">두 제목을 모두 비우면 제목 슬라이드를 만들지 않습니다.</p>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div><span className="section-number">03</span><h2>기본 역본</h2></div>
              </div>
              <div className="translation-grid">
                <label><span>영문</span><select value={settings.defaultEnglish} onChange={(event) => updateSetting('defaultEnglish', event.target.value)}>{Object.entries(ENGLISH_TRANSLATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                <label><span>한글</span><select value={settings.defaultKorean} onChange={(event) => updateSetting('defaultKorean', event.target.value)}>{Object.entries(KOREAN_TRANSLATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
              </div>
              <button type="button" className="text-button" onClick={applyTranslationsToAll} disabled={!references.length}>현재 모든 블록에 적용</button>
            </section>

            <section className="template-preview" aria-label="PPT 템플릿 미리보기">
              <div className="preview-screen">
                <div className="preview-text">
                  <strong>{settings.titleKo || '설교 제목'}</strong>
                  <span>{selectedReference ? `(${formatReference(selectedReference)})` : '(본문 구절)'}</span>
                </div>
              </div>
              <div><span>KCIC 기본 템플릿</span><small>16:9 · 제목 + 한/영 본문</small></div>
            </section>
          </aside>

          <section className="verses-column">
            <div className="verses-header">
              <div>
                <span className="section-number">04</span>
                <h2>성경구절 블록</h2>
                <p>클릭해 위치를 고르고, 손잡이를 끌어 순서를 바꾸세요.</p>
              </div>
              <div className="list-tools">
                <button type="button" onClick={pasteCopiedReference} disabled={!copiedReference}><ClipboardPaste size={16} /> 붙여넣기</button>
                <span>{references.length} blocks</span>
              </div>
            </div>

            <div className="quick-add">
              <div className="quick-add-icon"><Plus size={19} /></div>
              <label>
                <span>구절 빠르게 추가</span>
                <input
                  value={quickText}
                  onChange={(event) => setQuickText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addQuickReferences(); } }}
                  placeholder="요 3:16-17, Romans 8:28"
                />
              </label>
              <button type="button" className="primary-button compact" onClick={addQuickReferences}>추가</button>
              <small>{selectedReference ? `“${formatReference(selectedReference)}” 아래에 추가됩니다.` : '목록 맨 아래에 추가됩니다.'}</small>
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
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="empty-state">
                <div><Layers3 size={28} /></div>
                <h3>아직 구절 블록이 없습니다</h3>
                <p>위 입력창에 <strong>요 3:16</strong>처럼 적거나, 왼쪽에 원고를 놓아보세요.</p>
                <span>원고 없이 직접 추가해도 됩니다.</span>
              </div>
            )}

            <div className="keyboard-hint">
              <span><kbd>Ctrl/Cmd</kbd> + <kbd>C</kbd> 선택 블록 복사</span>
              <span><kbd>Ctrl/Cmd</kbd> + <kbd>V</kbd> 선택 아래 붙여넣기</span>
              <span><kbd>Ctrl/Cmd</kbd> + <kbd>D</kbd> 빠른 복제</span>
            </div>
          </section>
        </div>
      </main>

      <div className="download-dock">
        <div className="download-summary">
          <span className="slide-total">{slideCount}</span>
          <div><strong>예상 슬라이드</strong><small>제목 {hasTitle ? '1' : '0'}장 + 말씀 {verseSlides}장</small></div>
        </div>
        <label className="filename-field"><span>파일 이름</span><div><input value={settings.fileName} onChange={(event) => updateSetting('fileName', event.target.value)} /><b>.pptx</b></div></label>
        {generating && <div className="generation-progress"><div><span style={{ width: `${progressPercent}%` }} /></div><small>{progress.label}</small></div>}
        <button type="button" className="download-button" disabled={!references.length || generating} onClick={downloadPresentation}>
          {generating ? <LoaderCircle className="spin" size={20} /> : <Download size={20} />}
          {generating ? '만드는 중…' : 'PPT 다운로드'}
        </button>
      </div>

      <footer>
        <span>KCIC · KAIST-CNU International Chapel</span>
        <span>문서는 브라우저에서만 처리되며 서버에 저장되지 않습니다.</span>
      </footer>
    </div>
  );
}
