import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  FileText,
  GripVertical,
  Plus,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { buildLyricsText, extractSongsFromDocx, inferOutputFilename, parseSongsFromParagraphs } from './lib/lyrics.js';
import './lyrics.css';

function activeItem(items, id) {
  return items.find((item) => item.id === id) || items[0] || null;
}

export default function LyricsApp() {
  const fileInputRef = useRef(null);
  const draggedIndexRef = useRef(null);
  const [songs, setSongs] = useState([]);
  const [activeSongId, setActiveSongId] = useState(null);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [includeTags, setIncludeTags] = useState(false);
  const [outputName, setOutputName] = useState('lyrics.txt');
  const [fileInfo, setFileInfo] = useState(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsingLabel, setParsingLabel] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const song = activeItem(songs, activeSongId);
  const section = activeItem(song?.sections || [], activeSectionId);
  const output = useMemo(() => buildLyricsText(songs, { includeTags }), [songs, includeTags]);

  useEffect(() => {
    document.documentElement.lang = 'ko';
    document.title = 'KCIC Lyrics TXT';
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function updateSong(songId, updater) {
    setSongs((current) => current.map((item) => item.id === songId ? updater(item) : item));
  }

  function updateCurrentSong(updater) {
    if (song) updateSong(song.id, updater);
  }

  async function loadFile(file) {
    setError('');
    const extension = file?.name.split('.').pop()?.toLowerCase();
    if (!['docx', 'pdf', 'txt'].includes(extension)) {
      setError('DOCX, PDF 또는 TXT 파일을 선택해 주세요.');
      return;
    }
    setParsing(true);
    setParsingLabel(`${extension.toUpperCase()} 파일을 읽고 있어요…`);
    try {
      let parsedSongs;
      if (extension === 'docx') {
        parsedSongs = await extractSongsFromDocx(await file.arrayBuffer());
      } else {
        const { extractTextFromFile } = await import('./lib/documents.js');
        const text = await extractTextFromFile(file, (status) => setParsingLabel(status), 'ko');
        if (!text.trim()) {
          throw new Error(extension === 'pdf'
            ? 'PDF에서 텍스트를 찾지 못했습니다. 스캔 PDF는 OCR이 필요합니다.'
            : 'TXT 파일이 비어 있습니다.');
        }
        parsedSongs = parseSongsFromParagraphs(text.replace(/\f/g, '\n').split(/\r?\n/));
      }
      if (!parsedSongs.length) throw new Error('곡 제목과 가사 구간을 찾지 못했습니다. 그룹은 파일 형식을 정리한 뒤 다시 시도해 주세요.');
      setSongs(parsedSongs);
      setActiveSongId(parsedSongs[0].id);
      setActiveSectionId(parsedSongs[0].sections[0]?.id || null);
      setOutputName(inferOutputFilename(file.name));
      setFileInfo({ name: file.name, size: file.size, count: parsedSongs.length });
      window.setTimeout(() => document.querySelector('.lyrics-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (loadError) {
      setError(loadError.message || '파일을 읽는 중 문제가 생겼습니다.');
    } finally {
      setParsing(false);
      setParsingLabel('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function selectSong(songId) {
    const next = songs.find((item) => item.id === songId);
    setActiveSongId(songId);
    setActiveSectionId(next?.sections[0]?.id || null);
  }

  function moveSong(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= songs.length) return;
    setSongs((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function updateSection(patch) {
    if (!song || !section) return;
    updateCurrentSong((current) => ({
      ...current,
      sections: current.sections.map((item) => item.id === section.id ? { ...item, ...patch } : item),
    }));
  }

  function addSection() {
    if (!song) return;
    const id = `${song.id}-custom-${Date.now()}`;
    const created = { id, key: id, base: 'verse', number: '', label: 'New Section', lyrics: '' };
    updateCurrentSong((current) => ({ ...current, sections: [...current.sections, created] }));
    setActiveSectionId(id);
  }

  function deleteSection() {
    if (!song || !section) return;
    const remaining = song.sections.filter((item) => item.id !== section.id);
    updateCurrentSong((current) => ({
      ...current,
      sections: remaining,
      sequence: current.sequence.filter((id) => id !== section.id),
      defaultSequence: current.defaultSequence.filter((id) => id !== section.id),
    }));
    setActiveSectionId(remaining[0]?.id || null);
  }

  function addSequence(sectionId) {
    updateCurrentSong((current) => ({ ...current, sequence: [...current.sequence, sectionId] }));
  }

  function removeSequence(index) {
    updateCurrentSong((current) => ({ ...current, sequence: current.sequence.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function moveSequence(index, direction) {
    const nextIndex = index + direction;
    if (!song || nextIndex < 0 || nextIndex >= song.sequence.length) return;
    updateCurrentSong((current) => {
      const sequence = [...current.sequence];
      [sequence[index], sequence[nextIndex]] = [sequence[nextIndex], sequence[index]];
      return { ...current, sequence };
    });
  }

  function dropSequence(targetIndex) {
    const sourceIndex = draggedIndexRef.current;
    draggedIndexRef.current = null;
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    updateCurrentSong((current) => {
      const sequence = [...current.sequence];
      const [moved] = sequence.splice(sourceIndex, 1);
      sequence.splice(targetIndex, 0, moved);
      return { ...current, sequence };
    });
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setNotice('가사를 복사했습니다.');
    } catch {
      setNotice('복사하지 못했습니다.');
    }
  }

  function downloadOutput() {
    if (!output.trim()) {
      setNotice('출력할 곡을 선택해 주세요.');
      return;
    }
    const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = outputName.trim().endsWith('.txt') ? outputName.trim() : `${outputName.trim() || 'lyrics'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('TXT 파일을 저장했습니다.');
  }

  return (
    <div className="lyrics-page">
      <header className="lyrics-header">
        <a className="lyrics-brand" href="#/lyrics"><span>K</span><div><strong>KCIC</strong><small>LYRICS TXT</small></div></a>
        <a className="lyrics-back" href="#/"><ArrowLeft size={15} /> 말씀 PPT</a>
        <div className="lyrics-private"><i /> 문서는 이 브라우저에서만 처리됩니다</div>
      </header>

      <main className="lyrics-main">
        <section className="lyrics-intro">
          <p>DOCX → LYRICS</p>
          <h1>악보에서 가사만,<br /><em>원하는 순서대로.</em></h1>
          <span>DOCX·PDF·TXT에서 코드를 걷어내고 Verse·Chorus 그룹을 편집한 뒤 TXT로 저장하세요.</span>
        </section>

        <section className="lyrics-upload">
          <input ref={fileInputRef} type="file" accept=".docx,.pdf,.txt,application/pdf,text/plain" hidden onChange={(event) => loadFile(event.target.files[0])} />
          <button
            type="button"
            className={draggingFile ? 'is-dragging' : ''}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDraggingFile(false)}
            onDrop={(event) => { event.preventDefault(); setDraggingFile(false); loadFile(event.dataTransfer.files[0]); }}
          >
            <span className="lyrics-upload-icon"><Upload size={24} /></span>
            <span><strong>{parsing ? parsingLabel : '악보 파일을 놓아주세요'}</strong><small>DOCX · 텍스트형 PDF · TXT</small></span>
            <b>파일 선택</b>
          </button>
          {error && <p className="lyrics-error" role="alert">{error}</p>}
        </section>

        {songs.length > 0 && (
          <section className="lyrics-workspace">
            <aside className="lyrics-panel lyrics-songs">
              <div className="lyrics-file">
                <span><FileText size={18} /></span>
                <div><strong>{fileInfo?.name}</strong><small>{Math.round((fileInfo?.size || 0) / 1024)} KB · {fileInfo?.count}곡 감지</small></div>
                <button type="button" title="다른 파일" onClick={() => fileInputRef.current?.click()}><RotateCcw size={15} /></button>
              </div>
              <div className="lyrics-panel-heading"><div><b>1</b><h2>곡 선택</h2></div><span>{songs.filter((item) => item.included).length}/{songs.length}곡 출력</span></div>
              <div className="lyrics-song-list">
                {songs.map((item, index) => (
                  <div key={item.id} className={`lyrics-song ${item.id === song?.id ? 'is-active' : ''}`} onClick={() => selectSong(item.id)}>
                    <input type="checkbox" checked={item.included} aria-label={`${item.title} 출력`} onClick={(event) => event.stopPropagation()} onChange={(event) => updateSong(item.id, (current) => ({ ...current, included: event.target.checked }))} />
                    <div><strong>{item.title}</strong><small>{item.key ? `Key ${item.key} · ` : ''}{item.sections.length}개 그룹 · {item.sequence.length}개 블록</small></div>
                    <span>
                      <button type="button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveSong(index, -1); }}><ChevronUp size={13} /></button>
                      <button type="button" disabled={index === songs.length - 1} onClick={(event) => { event.stopPropagation(); moveSong(index, 1); }}><ChevronDown size={13} /></button>
                    </span>
                  </div>
                ))}
              </div>
            </aside>

            <section className="lyrics-panel lyrics-editor">
              <div className="lyrics-panel-heading"><div><b>2</b><h2>그룹과 순서</h2></div><button type="button" onClick={() => updateCurrentSong((current) => ({ ...current, sequence: [...current.defaultSequence] }))}>자동 순서로</button></div>
              <label className="lyrics-field"><span>곡 제목</span><input value={song?.title || ''} onChange={(event) => updateCurrentSong((current) => ({ ...current, title: event.target.value }))} /></label>

              <div className="lyrics-subheading"><div><h3>가사 그룹</h3><p>그룹을 골라 가사를 직접 다듬을 수 있어요.</p></div><button type="button" onClick={addSection}><Plus size={14} /> 그룹 추가</button></div>
              <div className="lyrics-tabs">
                {song?.sections.map((item) => <button type="button" key={item.id} className={item.id === section?.id ? 'is-active' : ''} onClick={() => setActiveSectionId(item.id)}>{item.label}</button>)}
              </div>
              <div className="lyrics-section-editor">
                {section ? <>
                  <div><input value={section.label} aria-label="그룹 이름" onChange={(event) => updateSection({ label: event.target.value || 'Untitled' })} /><button type="button" onClick={deleteSection}>그룹 삭제</button></div>
                  <textarea value={section.lyrics} aria-label={`${section.label} 가사`} onChange={(event) => updateSection({ lyrics: event.target.value })} />
                </> : <p>그룹을 하나 추가해 주세요.</p>}
              </div>

              <div className="lyrics-subheading lyrics-sequence-title"><div><h3>출력 시퀀스</h3><p>블록을 끌어서 옮기고, 같은 그룹을 여러 번 넣을 수 있어요.</p></div></div>
              <div className="lyrics-sequence" onDragOver={(event) => event.preventDefault()}>
                {song?.sequence.length ? song.sequence.map((sectionId, index) => {
                  const item = song.sections.find((candidate) => candidate.id === sectionId);
                  if (!item) return null;
                  return (
                    <div
                      key={`${sectionId}-${index}`}
                      className="lyrics-sequence-card"
                      draggable
                      onDragStart={() => { draggedIndexRef.current = index; }}
                      onDrop={() => dropSequence(index)}
                    >
                      <GripVertical size={13} /><strong>{item.label}</strong>
                      <span>
                        <button type="button" disabled={index === 0} onClick={() => moveSequence(index, -1)}><ChevronLeft size={13} /></button>
                        <button type="button" disabled={index === song.sequence.length - 1} onClick={() => moveSequence(index, 1)}><ChevronRight size={13} /></button>
                        <button type="button" onClick={() => removeSequence(index)}><X size={13} /></button>
                      </span>
                    </div>
                  );
                }) : <p>아래 그룹을 눌러 출력 블록을 추가하세요.</p>}
              </div>
              <div className="lyrics-add-sequence"><span>블록 추가</span><div>{song?.sections.map((item) => <button type="button" key={item.id} onClick={() => addSequence(item.id)}>+ {item.label}</button>)}</div></div>
            </section>

            <aside className="lyrics-panel lyrics-output">
              <div className="lyrics-panel-heading"><div><b>3</b><h2>TXT 미리보기</h2></div></div>
              <div className="lyrics-tag-toggle">
                <button type="button" className={!includeTags ? 'is-active' : ''} onClick={() => setIncludeTags(false)}>태그 없이</button>
                <button type="button" className={includeTags ? 'is-active' : ''} onClick={() => setIncludeTags(true)}>[Verse] 표시</button>
              </div>
              <label className="lyrics-field lyrics-filename"><span>파일명</span><input value={outputName} onChange={(event) => setOutputName(event.target.value)} /></label>
              <pre>{output}</pre>
              <div className="lyrics-actions">
                <button type="button" onClick={copyOutput}><Copy size={15} /> 복사</button>
                <button type="button" onClick={downloadOutput}><Download size={16} /> TXT 저장</button>
              </div>
            </aside>
          </section>
        )}
      </main>
      {notice && <div className="lyrics-toast" role="status">{notice}</div>}
    </div>
  );
}
