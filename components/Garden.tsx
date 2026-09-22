'use client';

import { useEffect, useReducer, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileCheck2,
  FlaskConical,
  Leaf,
  LockKeyhole,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Unplug,
  UserRound,
  WifiOff,
} from 'lucide-react';
import {
  CHANNELS,
  STORAGE_KEY,
  STEPS,
  blockedReasons,
  gardenReducer,
  initialGardenState,
  restoreGardenState,
  selectGardenTargets,
} from '../lib/garden';
export { gardenReducer, initialGardenState, restoreGardenState } from '../lib/garden';
export type { GardenAction, GardenLog, GardenState } from '../lib/garden';
import type { Preferences } from '../lib/feed';
import SelectedTagsToggle from './SelectedTagsToggle';
import './garden.css';

type Locale = 'zh' | 'en';
const MESSAGES: Record<string, [string, string]> = {
  PLAN_READY: [
    '已生成有界计划，等待你确认目标与授权。',
    'Bounded plan prepared. Waiting for your consent.',
  ],
  STARTED: ['你已确认计划；模拟执行开始。', 'You approved the plan. Simulation started.'],
  RESUMED: ['你已恢复运行，继续下一个安全步骤。', 'You resumed the run at the next safe step.'],
  OBSERVE: ['已核验模拟身份与频道前置状态。', 'Simulated identity and channel state observed.'],
  PREPARE: [
    '动作意图已保存，目标与授权检查通过。',
    'Intent saved. Target and consent checks passed.',
  ],
  EXECUTE: [
    '已执行一次模拟订阅，等待状态核验。',
    'Simulated subscription applied once. Verification next.',
  ],
  VERIFY: ['已核验模拟频道的订阅状态。', 'Simulated subscription state verified.'],
  CHECKPOINT: ['检查点已保存，进入下一个目标。', 'Checkpoint saved. Moving to the next target.'],
  FINISHED: [
    '全部已批准目标处理完毕，模拟计划已完成。',
    'All approved targets processed. Simulated plan complete.',
  ],
  MANUAL_PAUSE: [
    '你已暂停运行；不会开始新动作。',
    'You paused the run. No new actions will start.',
  ],
  ACCOUNT_CHANGED: [
    '模拟账号已切换，旧计划失效。请重新预览并确认。',
    'Simulated account changed. Preview and approve a new plan.',
  ],
  PROFILE_CHANGED: [
    '偏好版本已变化，旧计划失效。请重新预览并确认。',
    'Preferences changed. Preview and approve a new plan.',
  ],
  UNCERTAIN_RESULT: [
    '动作已提交但回执丢失。已暂停，请先核验模拟状态。',
    'Action submitted, receipt lost. Paused until state is reconciled.',
  ],
  RELOADED: [
    '已恢复本地检查点并暂停。重新确认后才能继续。',
    'Local checkpoint restored and paused. Reconfirm before resuming.',
  ],
  RECONCILED: [
    '已从模拟状态确认订阅成功，未重复执行。可手动继续。',
    'Subscription confirmed from simulated state. No duplicate action. Resume when ready.',
  ],
  PLAN_EXPIRED: [
    '两分钟的计划有效期已结束。请重新预览并确认。',
    'The two-minute plan expired. Preview and approve a new plan.',
  ],
  NOOP_ALREADY_SATISFIED: [
    '频道已经订阅；跳过写入，并记录状态证据。',
    'Already subscribed. Write skipped and state evidence recorded.',
  ],
  FAULT_ARMED: [
    '下一次实际模拟写入将丢失回执。',
    'The next simulated write will lose its receipt.',
  ],
};

export default function Garden({
  profileVersion,
  locale,
  preferences,
  onOnlySelectedTagsChange,
}: {
  profileVersion: number;
  locale: Locale;
  preferences: Preferences;
  onOnlySelectedTagsChange: (value: boolean) => void;
}) {
  const [state, dispatch] = useReducer(gardenReducer, undefined, initialGardenState);
  const [hydrated, setHydrated] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const en = locale === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const message = (code: string) => MESSAGES[code]?.[en ? 1 : 0] || code;
  useEffect(() => {
    try {
      dispatch({
        type: 'RESTORE',
        state: restoreGardenState(localStorage.getItem(STORAGE_KEY), profileVersion),
      });
    } catch {
      setStorageUnavailable(true);
    }
    setHydrated(true);
    // Read the initial browser snapshot once; later profile revisions are checked separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hydrated) dispatch({ type: 'PROFILE', version: profileVersion });
  }, [profileVersion, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setStorageUnavailable(true);
    }
  }, [state, hydrated]);
  useEffect(() => {
    if (state.status !== 'running') return;
    const timer = window.setInterval(
      () => dispatch({ type: 'TICK', version: profileVersion, now: Date.now() }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [state.status, profileVersion]);
  const planExists = state.status !== 'idle';
  const needsNewPlan = blockedReasons.includes(state.reason) && state.reason !== 'UNCERTAIN_RESULT';
  const canResume = state.status === 'paused' && !blockedReasons.includes(state.reason);
  const done = state.status === 'finished';
  const selectedTargets = selectGardenTargets(preferences);
  const showingNewTargets = !planExists || needsNewPlan;
  const targets = showingNewTargets
    ? selectedTargets
    : state.targetIds.flatMap((id) => CHANNELS.filter((channel) => channel.id === id));
  const targetCount = targets.length;
  const progress = done
    ? 100
    : state.targetIds.length
      ? Math.round(((state.index * 5 + state.step) / (state.targetIds.length * 5)) * 100)
      : 0;
  const statusText =
    state.status === 'running'
      ? t('正在模拟', 'Running simulation')
      : state.status === 'paused'
        ? t('已安全暂停', 'Safely paused')
        : done
          ? t('模拟已完成', 'Simulation complete')
          : t('准备就绪', 'Ready to simulate');

  return (
    <section className="garden-page">
      <div className="garden-title-row">
        <div>
          <div className="garden-eyebrow">
            <Sprout size={15} /> NATIVE FEED GARDENING
          </div>
          <h1>{t('信息花园', 'Garden')}</h1>
        </div>
        <span className="garden-simulator">
          <FlaskConical size={14} /> SIMULATOR ONLY
        </span>
      </div>

      <SelectedTagsToggle
        checked={preferences.onlySelectedTags === true}
        onChange={onOnlySelectedTagsChange}
      />
      <div className="garden-status-grid">
        <div className="garden-status-card">
          <span className="garden-status-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <span>{t('本地模拟执行器', 'Local simulator')}</span>
            <strong>
              <i
                className={state.status === 'running' ? 'garden-dot garden-pulse' : 'garden-dot'}
              />
              {statusText}
            </strong>
          </div>
        </div>
        <div className="garden-status-card">
          <span className="garden-status-icon garden-muted-icon">
            <LockKeyhole size={18} />
          </span>
          <div>
            <span>{t('真实平台写入', 'Live platform actions')}</span>
            <strong>{t('尚未接通', 'Not available yet')}</strong>
          </div>
        </div>
        <div className="garden-status-card">
          <span className="garden-status-icon garden-sand-icon">
            <CircleDashed size={19} />
          </span>
          <div>
            <span>{t('原生推荐效果', 'Native recommendation impact')}</span>
            <strong>{t('尚未验证', 'Not evaluated')}</strong>
          </div>
        </div>
      </div>

      {preferences.strategyMode === 'expert' && (
        <section className="garden-observation-panel">
          <div className="garden-observation-title">
            <span>
              <BarChart3 size={17} /> {t('专家模式 · 运行观测', 'Expert mode · Run observations')}
            </span>
            <strong>{t('0 次真实运行', '0 live runs')}</strong>
          </div>
          <div className="garden-observation-metrics">
            <div>
              <span>{t('基线 tag 出现率', 'Baseline tag rate')}</span>
              <strong>—</strong>
            </div>
            <div>
              <span>{t('后测 tag 出现率', 'Follow-up tag rate')}</span>
              <strong>—</strong>
            </div>
            <div>
              <span>{t('变化', 'Change')}</span>
              <strong>— pp</strong>
            </div>
            <div>
              <span>{t('可比较运行', 'Comparable runs')}</span>
              <strong>0 / 3</strong>
            </div>
          </div>
          <p>
            {t(
              '计算合同已经就绪，但本地浏览器 Runner 尚未接入，当前没有真实主页基线或后测数据。至少 3 次可比较 run 才显示汇总方向；它仍是观察关联，不是平台算法权重或因果证明。',
              'The calculation contract is ready, but the local browser Runner is not connected, so there are no real native-home baselines or follow-ups. At least three comparable runs are required for an aggregate direction; it remains an observed association, not a platform weight or causal proof.',
            )}
          </p>
          <div className="garden-decision-stack">
            <strong>{t('可选 Jev 评分层', 'Optional Jev scoring layer')}</strong>
            <span>
              {t(
                '程序提供视频标题和用户标签，Jev 只评估 1–10 分相关度。程序将 ≤3 分映射为跳过、≥7 分映射为观看候选，其余待复核；低置信度或预算不足时也待复核。未配置评分服务时不生成分数。真实播放执行程序尚未连接。',
                'The program supplies a video title and your tags. Jev scores relevance from 1–10. Program rules map scores of 3 or less to skip, 7 or more to a watch candidate, and the rest to review. Low confidence or insufficient budget also requires review. No scoring service means no score. Real playback is not connected yet.',
              )}
            </span>
          </div>
        </section>
      )}

      {state.reason && (
        <div
          className={`garden-notice ${state.reason === 'RECONCILED' ? 'garden-notice-success' : ''}`}
          role="status"
        >
          <ShieldCheck size={19} />
          <div>
            <strong>{message(state.reason)}</strong>
            <span>{state.reason}</span>
          </div>
          {state.reason === 'UNCERTAIN_RESULT' && (
            <button className="garden-small-button" onClick={() => dispatch({ type: 'RECONCILE' })}>
              <RefreshCw size={14} />
              {t('核验模拟状态', 'Reconcile state')}
            </button>
          )}
        </div>
      )}
      {storageUnavailable && (
        <div className="garden-notice" role="alert">
          {t(
            '浏览器本地存储不可用。本次演练不会在刷新后保留。',
            'Browser storage is unavailable. This simulation will not survive a refresh.',
          )}
        </div>
      )}

      <div className="garden-main-grid">
        <div className="garden-card garden-plan">
          <div className="garden-card-heading">
            <div>
              <div className="garden-overline">01 / {t('计划', 'PLAN')}</div>
              <h2>{t('模拟计划', 'Simulation plan')}</h2>
            </div>
            <FileCheck2 size={22} />
          </div>
          <div className="garden-plan-meta">
            <span>
              <UserRound size={13} />
              {t('模拟账号', 'Test account')} {state.account}
            </span>
            <span>
              <Leaf size={13} />
              {t('偏好', 'Preferences')} v{showingNewTargets ? profileVersion : state.planVersion}
            </span>
            <span>
              <Clock3 size={13} />
              {t('最多 3 次 · 2 分钟', 'Max 3 · 2 min')}
            </span>
          </div>
          <div className="garden-targets">
            {!targetCount && (
              <p className="garden-description" role="status">
                {t('无可用目标', 'No targets')}
              </p>
            )}
            {targets.map((channel, index) => {
              const subscribed = state.subscriptions[state.account].includes(channel.id);
              const active = state.status === 'running' && state.index === index;
              return (
                <div
                  className={`garden-target ${active ? 'garden-target-active' : ''}`}
                  key={channel.id}
                >
                  <span className={`garden-avatar garden-avatar-${channel.color}`}>
                    {channel.letters}
                  </span>
                  <div>
                    <strong>{channel.name}</strong>
                    <span>
                      {channel.topic[en ? 1 : 0]} <small>· {t('合成频道', 'synthetic')}</small>
                    </span>
                  </div>
                  <span className={`garden-action-tag ${subscribed ? 'garden-action-done' : ''}`}>
                    {subscribed ? (
                      <>
                        <Check size={13} />
                        {t('已订阅', 'Subscribed')}
                      </>
                    ) : (
                      <>
                        {t('模拟订阅', 'Subscribe')}
                        <ChevronRight size={13} />
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="garden-consent-area">
            {planExists && !needsNewPlan && !done && (
              <label className="garden-consent">
                <input
                  type="checkbox"
                  checked={state.consent}
                  disabled={state.status === 'running' || state.reason === 'UNCERTAIN_RESULT'}
                  onChange={(event) => dispatch({ type: 'CONSENT', value: event.target.checked })}
                />
                <span>
                  {t(
                    `我同意在模拟账号中执行以上 ${targetCount} 个目标的订阅计划。`,
                    `I approve this subscription plan for these ${targetCount} targets in the simulated account.`,
                  )}
                </span>
              </label>
            )}
            <div className="garden-plan-actions">
              {!planExists || needsNewPlan || done ? (
                <button
                  className="garden-primary-button"
                  disabled={!hydrated || !selectedTargets.length}
                  onClick={() =>
                    dispatch({
                      type: 'PLAN',
                      version: profileVersion,
                      now: Date.now(),
                      targetIds: selectedTargets.map((channel) => channel.id),
                    })
                  }
                >
                  <FileCheck2 size={16} />
                  {t(
                    planExists ? '重新预览计划' : '预览模拟计划',
                    planExists ? 'Preview a new plan' : 'Preview simulation plan',
                  )}
                  <ArrowRight size={16} />
                </button>
              ) : state.status === 'running' ? (
                <button
                  className="garden-primary-button"
                  onClick={() => dispatch({ type: 'PAUSE' })}
                >
                  <Pause size={16} />
                  {t('暂停运行', 'Pause run')}
                </button>
              ) : (
                <button
                  className="garden-primary-button"
                  disabled={!state.consent || state.reason === 'UNCERTAIN_RESULT'}
                  onClick={() =>
                    dispatch({
                      type: canResume ? 'RESUME' : 'START',
                      version: profileVersion,
                      now: Date.now(),
                    })
                  }
                >
                  <Play size={15} />
                  {t(
                    canResume ? '继续模拟' : '开始模拟',
                    canResume ? 'Resume simulation' : 'Start simulation',
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="garden-side-column">
          <div className="garden-card garden-session">
            <div className="garden-card-heading">
              <h2>{t('这次演练', 'This session')}</h2>
              <Monitor size={19} />
            </div>
            <div className="garden-session-identity">
              <span className="garden-session-avatar">
                <Sprout size={26} />
              </span>
              <div>
                <strong>Garden sandbox</strong>
                <span>
                  sim-account-{state.account.toLowerCase()} · {t('本地浏览器', 'local browser')}
                </span>
              </div>
            </div>
            <dl>
              <div>
                <dt>{t('运行环境', 'Environment')}</dt>
                <dd>simulator_only</dd>
              </div>
              <div>
                <dt>{t('动作预算', 'Action budget')}</dt>
                <dd>
                  {showingNewTargets ? 0 : state.index} / {targetCount}
                </dd>
              </div>
              <div>
                <dt>{t('同意 / 策略版本', 'Consent / policy version')}</dt>
                <dd>{state.consent ? 'v1' : '—'} / demo-1</dd>
              </div>
              <div>
                <dt>{t('最近检查点', 'Latest checkpoint')}</dt>
                <dd>
                  {t('修订', 'Revision')} #{String(state.revision).padStart(2, '0')}
                </dd>
              </div>
            </dl>
            <div className="garden-session-foot">
              <ShieldCheck size={14} />
              {t('模拟记录', 'Simulation log')}
            </div>
          </div>
          <div className="garden-real-card">
            <div>
              <span className="garden-youtube-mark">▶</span>
              <strong>YouTube</strong>
              <span className="garden-unavailable">{t('未接入', 'Unavailable')}</span>
            </div>
            <button disabled>
              <LockKeyhole size={14} />
              {t('启动真实平台调校', 'Start live gardening')}
            </button>
          </div>
        </aside>
      </div>

      <div className="garden-card garden-execution">
        <div className="garden-execution-top">
          <div>
            <div className="garden-overline">02 / {t('执行', 'RUN')}</div>
            <h2>{t('进度', 'Progress')}</h2>
          </div>
          <span className="garden-progress-number">
            {progress}
            <small>%</small>
          </span>
        </div>
        <div className="garden-progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="garden-steps">
          {STEPS.map((step, index) => {
            const complete = done || (planExists && index < state.step);
            const active = state.status === 'running' && index === state.step;
            const labels = [
              ['观察', 'Observe'],
              ['准备', 'Prepare'],
              ['执行', 'Execute'],
              ['核验', 'Verify'],
              ['保存', 'Checkpoint'],
            ];
            return (
              <div
                className={`garden-step ${active ? 'garden-step-active' : ''} ${complete ? 'garden-step-complete' : ''}`}
                key={step}
              >
                <span>{complete ? <Check size={15} /> : String(index + 1).padStart(2, '0')}</span>
                <strong>{labels[index][en ? 1 : 0]}</strong>
                <small>{step}</small>
              </div>
            );
          })}
        </div>
        <div className="garden-activity">
          <div className="garden-activity-title">
            <h3>{t('执行记录', 'Activity log')}</h3>
            <span>{t('模拟数据', 'Simulated')}</span>
          </div>
          <div className="garden-log" aria-live="polite" aria-relevant="additions">
            {state.logs.length ? (
              state.logs
                .slice()
                .reverse()
                .map((entry) => (
                  <div className="garden-log-row" key={entry.id}>
                    <span className="garden-log-id">{String(entry.id).padStart(2, '0')}</span>
                    <span className={`garden-actor garden-actor-${entry.actor}`}>
                      {entry.actor}
                    </span>
                    <div>
                      <span>{message(entry.code)}</span>
                      {entry.target && (
                        <small>
                          {CHANNELS.find((channel) => channel.id === entry.target)?.name}
                        </small>
                      )}
                    </div>
                    {[
                      'UNCERTAIN_RESULT',
                      'ACCOUNT_CHANGED',
                      'PROFILE_CHANGED',
                      'PLAN_EXPIRED',
                      'FAULT_ARMED',
                    ].includes(entry.code) ? (
                      <CircleDashed size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                  </div>
                ))
            ) : (
              <div className="garden-log-empty">
                <Leaf size={19} />
                <span>{t('暂无记录', 'No activity')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="garden-lab">
        <div>
          <FlaskConical size={18} />
          <div>
            <strong>{t('模拟控制', 'Simulation controls')}</strong>
          </div>
        </div>
        <div className="garden-lab-buttons">
          <button onClick={() => dispatch({ type: 'ACCOUNT' })} disabled={!hydrated}>
            <Unplug size={14} />
            {t('切换模拟账号', 'Switch test account')}
          </button>
          <button
            onClick={() => dispatch({ type: 'FAULT' })}
            disabled={state.status !== 'running' || state.fault}
          >
            <WifiOff size={14} />
            {state.fault
              ? t('已安排回执丢失', 'Receipt fault armed')
              : t('模拟回执丢失', 'Lose next receipt')}
          </button>
          <button onClick={() => dispatch({ type: 'RESET' })} disabled={!hydrated}>
            <RefreshCw size={14} />
            {t('重置演练', 'Reset demo')}
          </button>
        </div>
      </div>
    </section>
  );
}
