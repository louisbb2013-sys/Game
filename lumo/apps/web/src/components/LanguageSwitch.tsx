import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../i18n';
import { useAuth } from '../lib/auth';

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const { user, update } = useAuth();
  const current = i18n.language === 'fr' ? 'fr' : 'en';

  const choose = (l: Locale) => {
    setLocale(l);
    if (user) void update({ locale: l }).catch(() => {});
  };

  return (
    <div role="group" aria-label={t('settings.language')} className="inline-flex rounded-full bg-surface p-1 ring-1 ring-line">
      {(['en', 'fr'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={current === l}
          onClick={() => choose(l)}
          className={`rounded-full px-3 py-1 text-sm font-extrabold uppercase ${current === l ? 'bg-brand text-brand-ink' : 'text-muted'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
