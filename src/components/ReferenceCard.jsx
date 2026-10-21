import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Trash2, CopyPlus } from 'lucide-react';
import { BOOKS, ENGLISH_TRANSLATIONS, KOREAN_TRANSLATIONS } from '../data/books.js';
import { formatReference } from '../lib/references.js';

export default function ReferenceCard({
  reference,
  index,
  selected,
  onSelect,
  onUpdate,
  onCopy,
  onDuplicate,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: reference.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function updateBook(bookEn) {
    const book = BOOKS.find((candidate) => candidate.en === bookEn);
    onUpdate({ ...reference, bookEn: book.en, bookKo: book.ko, slug: book.slug });
  }

  function updateNumber(key, value) {
    const number = Math.max(1, Number(value) || 1);
    const next = { ...reference, [key]: number };
    if (key === 'verseStart' && next.verseEnd < number) next.verseEnd = number;
    if (key === 'verseEnd' && number < next.verseStart) next.verseEnd = next.verseStart;
    onUpdate(next);
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`reference-card ${selected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={onSelect}
      aria-label={`${index + 1}번 구절 블록 ${formatReference(reference)}`}
    >
      <div className="card-rail">
        <button
          className="drag-handle"
          type="button"
          aria-label="드래그하여 순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={19} />
        </button>
        <span className="order-number">{String(index + 1).padStart(2, '0')}</span>
      </div>

      <div className="reference-content">
        <div className="reference-heading">
          <div>
            <strong>{formatReference(reference)}</strong>
            <span>{formatReference(reference, 'en')}</span>
          </div>
          <span className="verse-count">{reference.verseEnd - reference.verseStart + 1}절</span>
        </div>

        <div className="reference-fields" onClick={(event) => event.stopPropagation()}>
          <label className="book-field">
            <span>성경</span>
            <select value={reference.bookEn} onChange={(event) => updateBook(event.target.value)}>
              {BOOKS.map((book) => <option key={book.en} value={book.en}>{book.ko}</option>)}
            </select>
          </label>
          <label>
            <span>장</span>
            <input type="number" min="1" max="150" value={reference.chapter} onChange={(event) => updateNumber('chapter', event.target.value)} />
          </label>
          <label>
            <span>시작 절</span>
            <input type="number" min="1" max="176" value={reference.verseStart} onChange={(event) => updateNumber('verseStart', event.target.value)} />
          </label>
          <label>
            <span>끝 절</span>
            <input type="number" min="1" max="176" value={reference.verseEnd} onChange={(event) => updateNumber('verseEnd', event.target.value)} />
          </label>
          <label>
            <span>영문 역본</span>
            <select value={reference.englishTranslation} onChange={(event) => onUpdate({ ...reference, englishTranslation: event.target.value })}>
              {Object.entries(ENGLISH_TRANSLATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>한글 역본</span>
            <select value={reference.koreanTranslation} onChange={(event) => onUpdate({ ...reference, koreanTranslation: event.target.value })}>
              {Object.entries(KOREAN_TRANSLATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
        </div>

        <div className="card-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={onCopy} title="복사 (Ctrl/Cmd+C)"><Copy size={15} /> 복사</button>
          <button type="button" onClick={onDuplicate} title="바로 아래에 복제"><CopyPlus size={15} /> 복제</button>
          <button type="button" className="danger-action" onClick={onRemove}><Trash2 size={15} /> 삭제</button>
        </div>
      </div>
    </article>
  );
}
