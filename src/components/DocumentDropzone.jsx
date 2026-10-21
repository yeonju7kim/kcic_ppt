import { useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { isSupportedDocument } from '../lib/fileTypes.js';

export default function DocumentDropzone({ file, busy, onFile, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function accept(candidate) {
    if (!candidate) return;
    if (!isSupportedDocument(candidate)) {
      onFile(candidate);
      return;
    }
    onFile(candidate);
  }

  return (
    <div
      className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        accept(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,.txt"
        hidden
        onChange={(event) => accept(event.target.files?.[0])}
      />
      {file ? (
        <>
          <div className="file-icon"><FileText size={22} /></div>
          <div className="file-copy">
            <strong>{file.name}</strong>
            <span>{(file.size / 1024 / 1024).toFixed(1)} MB · 기기 안에서만 읽습니다</span>
          </div>
          <button className="icon-button" type="button" onClick={onClear} aria-label="원고 선택 해제">
            <X size={18} />
          </button>
        </>
      ) : (
        <>
          <UploadCloud size={27} />
          <div>
            <strong>{busy ? '원고를 읽는 중입니다…' : '원고를 놓거나 선택하세요'}</strong>
            <span>DOCX · PDF · TXT, 선택 사항</span>
          </div>
          <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            파일 선택
          </button>
        </>
      )}
    </div>
  );
}
