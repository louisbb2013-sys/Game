import type { SandboxData, SandboxKind } from '@lumo/core';
import { SANDBOX_EMOJI } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { EscapeRoomPlayer, QuizShowPlayer } from '../components/sandbox/challenges';
import { CrosswordPlayer, MemoryPlayer, ScramblePlayer, SpeedPlayer, TwoTruthsPlayer, WordSearchPlayer } from '../components/sandbox/games';
import { CheatSheetPlayer, FlashcardsPlayer, MindMapPlayer, MnemonicsPlayer, TimelinePlayer } from '../components/sandbox/review';
import { BigButton } from '../components/sandbox/shared';
import { PodcastPlayer, StoryPlayer, VideoPlayer } from '../components/sandbox/watch';
import { api } from '../lib/api';
import { guessLanguage } from '../lib/speech';
import { useAuth } from '../lib/auth';
import { play, setSoundEnabled } from '../lib/sound';
import { useRewards, type Rewards } from '../lib/rewards';

interface Activity {
  id: string;
  deckId: string | null;
  kind: SandboxKind;
  title: string;
  data: SandboxData;
  completed: boolean;
  language?: 'en' | 'fr';
}

export function SandboxPlay() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState(false);
  const [reward, setReward] = useState<{ score: number; xp: number; streak: { days: number; extended: boolean } } | null>(null);
  const [again, setAgain] = useState(false);
  const showRewards = useRewards();

  useEffect(() => setSoundEnabled(user?.settings.sound ?? true), [user?.settings.sound]);
  useEffect(() => {
    setA(null);
    setReward(null);
    api<Activity>(`/api/sandbox/${id}`).then(setA, () => setError(true));
  }, [id]);

  const complete = async (score: number) => {
    const r = await api<{ xp: number; streak: { days: number; extended: boolean }; rewards?: Rewards }>(`/api/sandbox/${id}/complete`, { method: 'POST', body: { score } }).catch(() => ({ xp: 0, streak: { days: 0, extended: false }, rewards: undefined }));
    showRewards(r.rewards);
    setReward({ score, ...r });
    play('finish');
    void refresh();
  };
  const playAgain = async () => {
    if (!a?.deckId) return;
    setAgain(true);
    const n = await api<{ id: string }>('/api/sandbox', { method: 'POST', body: { deckId: a.deckId, kind: a.kind } }).finally(() => setAgain(false));
    navigate(`/sandbox/play/${n.id}`, { replace: true });
  };

  if (error) return <p className="pt-16 text-center font-bold">{t('sandbox.notFound')}</p>;
  if (!a) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Lumo size={100} mood="thinking" />
        <p className="font-bold text-muted">{t('sandbox.making')}</p>
      </div>
    );
  }
  // The voice reads in the activity's own language (an English deck in a French Lumo stays English).
  const lang = a.language ?? guessLanguage(JSON.stringify(a.data));
  const props = { language: lang as 'en' | 'fr', onComplete: (s: number) => void complete(s) };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(a.deckId ? `/sandbox?deck=${a.deckId}` : '/sandbox')} className="rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line" aria-label={t('common.back')}>
          ←
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black">
            {SANDBOX_EMOJI[a.kind]} {t(`sandbox.kinds.${a.kind}`)}
          </h1>
          <p className="truncate text-sm text-muted">{a.title}</p>
        </div>
      </div>

      {reward ? (
        <div className="pop-in flex flex-col items-center gap-3 rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <Lumo size={110} mood={reward.score >= 0.5 ? 'cheer' : 'happy'} glow={1} />
          <p className="text-3xl font-black">{Math.round(reward.score * 100)}%</p>
          <p className="font-bold text-muted">{reward.score >= 0.8 ? t('sandbox.great') : reward.score >= 0.5 ? t('sandbox.good') : t('sandbox.keepGoing')}</p>
          <div className="flex gap-2 text-sm font-black">
            {reward.xp > 0 && <span className="rounded-full bg-amber-glow/25 px-3 py-1">+{reward.xp} XP</span>}
            {reward.streak.extended && <span className="rounded-full bg-surface-2 px-3 py-1">🔥 {t('quiz.streakDays', { count: reward.streak.days })}</span>}
          </div>
          <div className="grid w-full gap-2">
            <BigButton onClick={() => void playAgain()} disabled={again}>
              {again ? '…' : `🔁 ${t('sandbox.newVersion')}`}
            </BigButton>
            <BigButton tone="plain" onClick={() => navigate(a.deckId ? `/sandbox?deck=${a.deckId}` : '/sandbox')}>
              {t('sandbox.otherFormat')}
            </BigButton>
          </div>
        </div>
      ) : (
        <Player kind={a.kind} data={a.data} {...props} />
      )}
    </div>
  );
}

function Player({ kind, data, ...p }: { kind: SandboxKind; data: SandboxData; language: 'en' | 'fr'; onComplete: (s: number) => void }) {
  switch (data.kind) {
    case 'video':
      return <VideoPlayer data={data} {...p} />;
    case 'podcast':
      return <PodcastPlayer data={data} {...p} />;
    case 'story':
      return <StoryPlayer data={data} {...p} />;
    case 'crossword':
      return <CrosswordPlayer data={data} {...p} />;
    case 'word_search':
      return <WordSearchPlayer data={data} {...p} />;
    case 'memory':
      return <MemoryPlayer data={data} {...p} />;
    case 'scramble':
      return <ScramblePlayer data={data} {...p} />;
    case 'quiz_show':
      return <QuizShowPlayer data={data} {...p} />;
    case 'escape_room':
      return <EscapeRoomPlayer data={data} {...p} />;
    case 'speed_round':
      return <SpeedPlayer data={data} {...p} />;
    case 'two_truths':
      return <TwoTruthsPlayer data={data} {...p} />;
    case 'flashcards':
      return <FlashcardsPlayer data={data} {...p} />;
    case 'mind_map':
      return <MindMapPlayer data={data} {...p} />;
    case 'cheat_sheet':
      return <CheatSheetPlayer data={data} {...p} />;
    case 'mnemonics':
      return <MnemonicsPlayer data={data} {...p} />;
    case 'timeline':
      return <TimelinePlayer data={data} {...p} />;
    default:
      return <p>{kind}</p>;
  }
}
