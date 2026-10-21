import { useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { isSupportedDocument } from '../lib/fileTypes.js';

export default function DocumentDropzone({ file, busy, onFile, onClear, copy }) {
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
            <span>{(file.size / 1024 / 1024).toFixed(1)} {copy.localOnly}</span>
          </div>
          <button className="icon-button" type="button" onClick={onClear} aria-label={copy.clear}>
            <X size={18} />
          </button>
        </>
      ) : (
        <>
          <UploadCloud size={27} />
          <div>
            <strong>{busy ? copy.reading : copy.prompt}</strong>
            <span>{copy.formats}</span>
          </div>
          <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {copy.choose}
          </button>
        </>
      )}
    </div>
  );
}
