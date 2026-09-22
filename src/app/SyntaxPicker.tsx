import { useState } from 'react';
import { Modal } from './Modal';
import { syntaxes, type SyntaxId } from '../files/syntaxRegistry';
import { useI18n } from '../i18n/i18n';

export function SyntaxPicker({
  selected,
  onSelect,
  onCancel,
}: {
  selected: SyntaxId | null;
  onSelect: (syntax: SyntaxId | null) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const matches = syntaxes.filter((syntax) =>
    [t(syntax.label), syntax.id, ...syntax.extensions]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase().replace(/^\./, '')),
  );
  return (
    <Modal titleId="syntax-title" onCancel={onCancel}>
      <h2 id="syntax-title">{t('Select syntax')}</h2>
      <input
        aria-label={t('Search syntax')}
        placeholder={t('Search syntax')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && matches.length === 1) {
            event.preventDefault();
            event.stopPropagation();
            onSelect(matches[0].id);
          }
        }}
      />
      <div className="syntax-options">
        <button aria-pressed={selected === null} onClick={() => onSelect(null)}>
          {t('Automatic (file name)')}
        </button>
        {matches.map((syntax) => (
          <button
            key={syntax.id}
            aria-pressed={selected === syntax.id}
            onClick={() => onSelect(syntax.id)}
          >
            <span>{t(syntax.label)}</span>
            <small>{syntax.extensions.map((ext) => `.${ext}`).join(', ')}</small>
          </button>
        ))}
        {!matches.length && <p>{t('No matching syntax. Unknown extensions use Plain Text.')}</p>}
      </div>
      <div className="dialog-actions">
        <button onClick={onCancel}>{t('Cancel')}</button>
      </div>
    </Modal>
  );
}
