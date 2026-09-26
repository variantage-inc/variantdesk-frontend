'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { VoiceConfirm } from '@/components/voice/voice-confirm';
import {
  ApiError,
  captureVoice,
  getVoiceOptions,
  type VoiceDraft,
  type VoiceOptions,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { VoiceRecorder, canRecord } from '@/lib/voice-recorder';

/* Voice entry.

   Five states on one screen, exactly as the reviewed mockup draws them: ready,
   listening, working it out, confirm, and not recognised.

   THE RULE THE SCREEN EXISTS TO KEEP: nothing is written from speech. Whatever
   came back, however plainly it was said, the flow stops at a confirmation
   somebody has to approve. That was the client's own requirement, and it is
   what makes dictating money safe: the worst a misheard word can do is waste a
   few seconds.

   Two things this screen does that the mockup could not, because the mockup
   had no microphone and no API behind it:

   The clip is recorded and re-encoded here. The browser's own recorder makes
   WebM, which is not a format Gemini reads, so `lib/voice-recorder.ts` decodes
   it once and hands back WAV. See that file for why it is done after recording
   rather than live.

   Recording stops itself at the limit the API reports. A microphone left open
   because somebody walked away is a cost and a privacy problem, and the number
   comes from the API rather than being written down twice. */

type Stage = 'ready' | 'listening' | 'processing' | 'confirm' | 'unknown';

const BARS = 22;

function VoiceScreen() {
  const toast = useToast();
  const { access } = useSession();

  const [options, setOptions] = useState<VoiceOptions | null>(null);
  const [stage, setStage] = useState<Stage>('ready');
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0));
  const [elapsed, setElapsed] = useState(0);

  const recorder = useRef<VoiceRecorder | null>(null);

  useEffect(() => {
    getVoiceOptions()
      .then(setOptions)
      .catch(() => setProblem('We could not load this screen. Refresh and try again.'));
  }, []);

  /* The microphone light goes out if this page is left while it is open. */
  useEffect(() => () => recorder.current?.release(), []);

  const maxSeconds = options?.maxSeconds ?? 30;
  const canWrite = access?.canWrite ?? false;

  const send = useCallback(
    async (clip: Blob) => {
      setStage('processing');
      try {
        const result = await captureVoice(clip);
        setDraft(result);
        setStage(result.status === 'FAILED' ? 'unknown' : 'confirm');
      } catch (err) {
        setProblem(
          err instanceof ApiError ? err.message : 'We could not read that clip. Try again.',
        );
        setStage('ready');
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;

    try {
      const { blob, seconds } = await active.stop();
      if (seconds < 0.7) {
        setProblem('That was too short to hear. Hold the button while you speak.');
        setStage('ready');
        return;
      }
      await send(blob);
    } catch {
      setProblem('We could not use that recording. Try again, or type the entry in.');
      setStage('ready');
    }
  }, [send]);

  /* Two clocks while it is listening, and they are separate on purpose.

     The meter runs on animation frames, which is what a meter should do and
     which the browser stops when the tab is not on screen. Nobody is watching
     a meter they cannot see.

     THE TIME LIMIT DOES NOT. It is a plain timer, because animation frames
     stop in a hidden tab and a microphone that keeps recording while somebody
     works in another tab is exactly what the limit exists to prevent. A
     background timer is throttled to about a second, which on a thirty second
     cap is close enough and is on the safe side.

     Both are owned by the listening stage, so leaving it for any reason,
     including leaving the page, stops them. */
  useEffect(() => {
    if (stage !== 'listening') return;

    let frame = 0;
    const tick = () => {
      const active = recorder.current;
      if (!active) return;
      setLevels(active.levels(BARS));
      setElapsed(active.seconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const limit = setTimeout(() => void stop(), maxSeconds * 1000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(limit);
    };
  }, [stage, maxSeconds, stop]);

  async function listen() {
    setProblem(null);
    setDraft(null);

    const active = new VoiceRecorder();
    try {
      await active.start();
    } catch {
      /* Refused, or there is no microphone. Either way the answer is the same
         and the typed form is one click away. */
      setProblem(
        'We could not reach your microphone. Allow it in your browser, or type the entry in.',
      );
      return;
    }

    recorder.current = active;
    setElapsed(0);
    /* Setting the stage starts the frame loop, in the effect above. */
    setStage('listening');
  }

  function reset() {
    recorder.current?.release();
    recorder.current = null;
    setDraft(null);
    setStage('ready');
  }

  const unavailable = options && !options.configured;

  return (
    <AppShell crumb="Voice entry">
      <div className="phead">
        <div>
          <h1>Voice entry</h1>
          <p className="sub">
            Say what happened in an ordinary sentence. Variantage works out the amount, the
            type, the category and who it was with, and shows you before it saves.
          </p>
        </div>
        <div className="acts">
          <Link className="btn btn-sm" href="/expenses">
            <Icon name="edit" size={17} /> Type it instead
          </Link>
        </div>
      </div>

      {!canWrite && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="warn" icon="lock" title="Read only">
            Nothing new can be added while the account is read only, dictated or typed.
            Everything already here stays exactly as it is.
          </Notice>
        </div>
      )}

      {unavailable && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="warn" icon="alert" title="Voice entry is not switched on yet">
            The service that reads a spoken sentence has not been configured on this server.
            Everything else works; type the entry in for now.
          </Notice>
        </div>
      )}

      {problem && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="err" icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      <div className="voicegrid">
        <div className="panel">
          {stage === 'ready' && (
            <div className="stage">
              <button
                className="mic"
                onClick={listen}
                disabled={!canWrite || !!unavailable || !canRecord()}
                aria-label="Start listening"
              >
                <span className="ripple" />
                <span className="ripple" />
                <Icon name="mic" size={44} sw={1.7} />
              </button>
              <div>
                <h2>Ready when you are</h2>
                <p className="lead2">
                  Press the microphone and say something like{' '}
                  <b>&ldquo;received five hundred dollars from Northwind Studio&rdquo;</b>.
                </p>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {canRecord()
                  ? 'Nothing is recorded until you press. Nothing is saved until you approve it.'
                  : 'This browser cannot record audio. Type the entry in instead.'}
              </p>
            </div>
          )}

          {stage === 'listening' && (
            <div className="stage">
              <button className="mic live" onClick={stop} aria-label="Stop listening">
                <span className="ripple" />
                <span className="ripple" />
                <Icon name="mic" size={44} sw={1.7} />
              </button>

              <div className="levels" aria-hidden="true">
                {levels.map((level, i) => (
                  <i key={i} style={{ height: `${14 + level * 86}%` }} />
                ))}
              </div>

              <div>
                <h2>Listening…</h2>
                <p className="lead2">
                  Speak normally. Press the microphone again when you have finished.
                </p>
              </div>

              {/* The mockup showed words appearing as they were heard. Nothing
                  is transcribed until the clip is complete, so what is honest
                  to show is how long is left rather than a transcript that
                  does not exist yet. */}
              <div className="heard">
                <span className="q">Recording</span>
                <span>
                  {elapsed.toFixed(1)}s of {maxSeconds}s
                </span>
              </div>
            </div>
          )}

          {stage === 'processing' && (
            <div className="stage">
              <div className="mic busy" aria-hidden="true">
                <Icon name="refresh" size={42} sw={1.8} />
              </div>
              <div>
                <h2>Working out what you said</h2>
                <p className="lead2">
                  Finding the amount, the type of entry, the category and who it was with.
                </p>
              </div>
            </div>
          )}

          {stage === 'confirm' && draft && options && (
            <VoiceConfirm
              draft={draft}
              options={options}
              onSaved={(message) => {
                toast(message);
                reset();
              }}
              onDiscarded={() => {
                toast('Discarded. Nothing was saved.');
                reset();
              }}
              onAgain={() => {
                reset();
                void listen();
              }}
            />
          )}

          {stage === 'unknown' && draft && (
            <div className="stage">
              <div className="glyph glyph-warn" style={{ margin: 0 }}>
                <Icon name="alert" size={34} />
              </div>
              <div>
                <h2>I did not catch an amount</h2>
                <p className="lead2">
                  Nothing has been saved. Every voice entry needs a number in it: without one
                  there is nothing to record.
                </p>
              </div>
              <div className="heard">
                <span className="q">What I heard</span>
                <span>{draft.transcript}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    reset();
                    void listen();
                  }}
                >
                  <Icon name="mic" size={19} /> Try again
                </button>
                <Link className="btn" href="/expenses">
                  <Icon name="edit" size={18} /> Type it in instead
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="rail">
          <div className="notice notice-ok" style={{ margin: 0 }}>
            <Icon name="shield" size={22} />
            <span>
              <b>Nothing is saved from your voice alone</b>
              Every entry stops at the confirmation step, whatever it heard. That was your own
              requirement, and it is the reason voice entry is safe to use for money: the
              worst a misheard word can do is waste a few seconds.
            </span>
          </div>

          <div className="notice notice-info" style={{ margin: 0 }}>
            <Icon name="mic" size={22} />
            <span>
              <b>Income, expenses and drawings, all three</b>
              &ldquo;Received&rdquo;, &ldquo;paid&rdquo; and &ldquo;took out&rdquo; are enough
              to tell them apart. A drawing recognised by voice is still kept out of profit,
              exactly as one typed in is.
            </span>
          </div>

          <div className="notice notice-info" style={{ margin: 0 }}>
            <Icon name="user" size={22} />
            <span>
              <b>Nothing new is created from what you say</b>
              A vendor or client you have not entered yet is not invented because a name was
              heard. The name is kept, and the confirmation asks you who it was.
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function VoicePage() {
  return (
    <ToastProvider>
      <VoiceScreen />
    </ToastProvider>
  );
}
