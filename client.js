window.__ModuleLoader__.load({
  id: 'dsh-math2-study',
  factory(require) {
    const { createElement: h, Fragment: ReactFragment, useCallback, useEffect, useRef, useState } = require('react');
    const panelId = 'math2-study';
    const labels = {
      zh: {
        panel: '学习看板', heading: '考研数学二', refresh: '刷新', loading: '正在读取学习记录',
        emptyTitle: '从第一道题开始', emptyText: '新建会话，选择「考研数学二」预设。提交实际作答后，这里会显示你的学习进展。',
        failure: '暂时无法读取学习库。可刷新重试。', stale: '刷新失败，正在显示上次读到的数据。',
        coverage: '已确认学完的章节', attempts: '实际作答', errors: '关联错题', due: '到期复习', independent: '独立正确',
        practice: '作答趋势', reviews: '待复习', chapters: '章节进度', recent: '最近作答', causes: '已确认错因',
        week: '7 天', fortnight: '14 天', all: '全部', calculus: '高等数学', algebra: '线性代数',
        noneReview: '暂无到期任务', nonePractice: '这段时间暂无作答记录', noneRecent: '暂无作答记录',
        noneCause: '暂无足够的错因证据', noMastery: '待评估', unknown: '未知', not_started: '未学习', learning: '正在学习', learned: '已学习',
        wrong: '错误', unfinished: '未完成', guessed: '蒙对', hinted_correct: '提示后正确',
        independent_correct: '独立正确', unverified: '未核验', pending: '项待复习', min: '分钟',
        score: '目标分', examYear: '目标年份', revision: '数据修订', upcoming: '后续任务', more: '另有',
        evidence: '条证据', distinct: '道题', reassess: '证据已更新，待复核',
        writeInProgress: '正在更新学习记录', writeSettled: '学习记录操作已结束',
        startReview: '开始复习', viewAttempt: '查看作答', reviewTitle: '复习题面', attemptTitle: '作答详情',
        detailLoading: '正在读取详情', detailError: '暂时无法读取详情，请重试。', retry: '重试', close: '关闭',
        statement: '题面', originalAnswer: '原始作答', diagnosis: '诊断与首错', source: '来源',
        occurredAt: '作答时间', recordedAt: '入库时间', originalReview: '原题重做', variantReview: '同类变式',
        sourceQuestion: '关联原题', reviewNeedsCheck: '待重新核验', reviewCompleted: '已完成',
        reviewCommand: '复习指令',
        copyReview: '复制复习指令', copiedReview: '复习指令已复制', manualCopy: '请手动复制选中的指令。',
        reviewHandoff: '把指令粘贴到使用「考研数学二」预设的会话，继续作答和批改。',
      },
      en: {
        panel: 'Study dashboard', heading: 'Math II study', refresh: 'Refresh', loading: 'Loading study records',
        emptyTitle: 'Start with your first problem', emptyText: 'In a new session, choose the 考研数学二 preset and submit an attempt to track your progress.',
        failure: 'Could not read the study database. Refresh to retry.', stale: 'Refresh failed. Showing the last loaded data.',
        coverage: 'Confirmed chapters studied', attempts: 'Attempts', errors: 'Mistake records', due: 'Due reviews', independent: 'Independently correct',
        practice: 'Practice activity', reviews: 'Due reviews', chapters: 'Chapter progress', recent: 'Recent attempts', causes: 'Confirmed mistakes',
        week: '7 days', fortnight: '14 days', all: 'All', calculus: 'Calculus', algebra: 'Linear algebra',
        noneReview: 'No reviews due', nonePractice: 'No attempts in this period', noneRecent: 'No attempts yet',
        noneCause: 'No confirmed causes yet', noMastery: 'Unassessed', unknown: 'Unknown', not_started: 'Not started', learning: 'In progress', learned: 'Studied',
        wrong: 'Incorrect', unfinished: 'Incomplete', guessed: 'Guessed', hinted_correct: 'Correct with hints',
        independent_correct: 'Independently correct', unverified: 'Unverified', pending: 'due', min: 'min',
        score: 'Target score', examYear: 'Exam year', revision: 'Data revision', upcoming: 'Upcoming', more: 'More',
        evidence: 'records', distinct: 'problems', reassess: 'Evidence changed; reassessment due',
        writeInProgress: 'Updating study records', writeSettled: 'Study record operation finished',
        startReview: 'Start review', viewAttempt: 'View attempt', reviewTitle: 'Review problem', attemptTitle: 'Attempt details',
        detailLoading: 'Loading details', detailError: 'Could not read the details. Please retry.', retry: 'Retry', close: 'Close',
        statement: 'Problem', originalAnswer: 'Original answer', diagnosis: 'Diagnosis and first mistake', source: 'Source',
        occurredAt: 'Attempt time', recordedAt: 'Recorded time', originalReview: 'Original problem', variantReview: 'Related variant',
        sourceQuestion: 'Linked original', reviewNeedsCheck: 'Needs recheck', reviewCompleted: 'Completed',
        reviewCommand: 'Review command',
        copyReview: 'Copy review command', copiedReview: 'Review command copied', manualCopy: 'Copy the selected command manually.',
        reviewHandoff: 'Paste the command into a session using the 考研数学二 preset to continue and submit your answer.',
      },
    };

    const styles = `
      .m2-page{--m2-bg:var(--dsw-alias-bg-primary,light-dark(#f7f8fc,#151821));--m2-card:var(--dsw-alias-bg-secondary,light-dark(#fff,#1d2330));--m2-text:var(--dsw-alias-text-primary,light-dark(#20253a,#e9edf8));--m2-muted:var(--dsw-alias-text-secondary,light-dark(#59657d,#aab5cd));--m2-line:var(--dsw-alias-border-default,light-dark(#e0e6f0,#394257));--m2-accent:light-dark(#285bc5,#96b7ff);--m2-accent-soft:light-dark(#e9efff,#29385d);--m2-green:light-dark(#1f6f59,#88dac5);--m2-green-soft:light-dark(#e6f5ef,#1d3736);--m2-warm:light-dark(#965010,#f1ba81);--m2-warm-soft:light-dark(#fff2e4,#3e2e26);box-sizing:border-box;min-height:0;height:100%;width:100%;overflow:auto;background:var(--m2-bg);color:var(--m2-text);font:inherit}
      .m2-page *{box-sizing:border-box}
      .m2-wrap{max-width:1280px;margin:auto;padding:calc(28px + var(--dsh-frame-top-clearance,0px)) clamp(16px,3.5vw,46px) 40px;display:grid;gap:19px}
      .m2-heading,.m2-card-header,.m2-lineitem,.m2-goals{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
      .m2-heading{align-items:flex-start}.m2-heading h1{font-size:clamp(26px,4vw,36px);letter-spacing:-.025em;margin:3px 0 0;line-height:1.2;font-weight:730}
      .m2-kicker,.m2-subtle{color:var(--m2-muted);font-size:12px;line-height:1.45}
      .m2-goals{justify-content:flex-start;flex-wrap:wrap;margin-top:9px}
      .m2-button{border:1px solid var(--m2-line);border-radius:8px;padding:7px 10px;background:var(--m2-card);color:var(--m2-text);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
      .m2-button:hover,.m2-button[aria-pressed=true]{color:var(--m2-accent);background:var(--m2-accent-soft);border-color:transparent}.m2-button:focus-visible{outline:2px solid var(--m2-accent);outline-offset:2px}
      .m2-button:disabled{opacity:.6;cursor:default}.m2-filters{display:flex;flex-wrap:wrap;gap:4px}
      .m2-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .m2-card,.m2-stat,.m2-notice{background:var(--m2-card);border:1px solid var(--m2-line);border-radius:13px;padding:16px;min-width:0}
      .m2-stat strong{display:block;font-size:30px;line-height:1.25;font-weight:730;font-variant-numeric:tabular-nums;margin-top:6px}.m2-stat small{font-size:13px;font-weight:500;color:var(--m2-muted)}
      .m2-stat:first-child strong{color:var(--m2-accent)}.m2-stat:last-child strong{color:var(--m2-warm)}
      .m2-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(230px,1fr);gap:14px;align-items:start}
      .m2-card h2,.m2-notice h2{margin:0;font-size:15px;line-height:1.4;font-weight:680}.m2-notice p{margin:7px 0 0}
      .m2-card-header{min-height:31px;margin-bottom:15px;flex-wrap:wrap}
      .m2-trend{display:flex;align-items:stretch;gap:clamp(2px,1.15vw,9px);height:150px;border-bottom:1px solid var(--m2-line);padding:8px 2px 0}
      .m2-day{flex:1;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:6px;min-width:0}
      .m2-bar{display:grid;align-items:end;width:74%;max-width:29px;background:var(--m2-accent-soft);border-radius:5px 5px 0 0;overflow:hidden}
      .m2-bar i{background:var(--m2-accent);width:100%;display:block}.m2-day time{font-size:10px;color:var(--m2-muted);padding-bottom:5px;white-space:nowrap}
      .m2-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px}.m2-legend span{display:inline-flex;align-items:center;gap:6px}.m2-dot{width:8px;height:8px;border-radius:50%;background:var(--m2-accent-soft);border:1px solid var(--m2-line)}.m2-dot.on{background:var(--m2-accent)}
      .m2-list{list-style:none;margin:0;padding:0;display:grid}.m2-lineitem{padding:9px 0;border-top:1px solid var(--m2-line);font-size:13px}.m2-lineitem:first-child{border-top:0}
      .m2-lineitem>div{min-width:0;overflow-wrap:anywhere}.m2-lineitem strong{display:block;overflow-wrap:anywhere;font-weight:610}
      .m2-row-actions,.m2-detail-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .m2-row-actions{flex-shrink:0;justify-content:flex-end;max-width:58%}
      .m2-pill{background:var(--m2-bg);color:var(--m2-muted);border-radius:999px;font-size:11px;padding:4px 7px;white-space:nowrap;display:inline-block}
      .m2-pill.learned,.m2-pill.independent_correct{background:var(--m2-green-soft);color:var(--m2-green)}
      .m2-pill.learning,.m2-pill.hinted_correct{background:var(--m2-accent-soft);color:var(--m2-accent)}
      .m2-pill.wrong,.m2-pill.unfinished,.m2-pill.priority{background:var(--m2-warm-soft);color:var(--m2-warm)}
      .m2-coverage{display:grid;gap:5px;text-align:right;justify-items:end;max-width:56%;min-width:0;overflow-wrap:anywhere}
      .m2-empty{padding:16px 0;color:var(--m2-muted);font-size:13px}
      .m2-error{border-color:var(--m2-warm);color:var(--m2-warm)}.m2-foot{margin-top:0}
      .m2-dialog{width:min(660px,calc(100% - 28px));max-height:86vh;margin:auto;padding:0;border:1px solid var(--m2-line);border-radius:13px;background:var(--m2-card);color:var(--m2-text);overscroll-behavior:contain}
      .m2-dialog::backdrop{background:rgb(10 16 30 / .48)}
      .m2-detail-header{position:sticky;z-index:1;top:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--m2-line);background:var(--m2-card)}
      .m2-detail-header h2,.m2-detail-body h3,.m2-detail-body p{margin:0}
      .m2-detail-header h2{font-size:17px}.m2-detail-body h3{font-size:14px}
      .m2-detail-body{display:grid;gap:13px;padding:18px;overflow-wrap:anywhere}
      .m2-detail-section{display:grid;gap:6px}.m2-detail-text{white-space:pre-wrap;padding:8px 10px;border-radius:8px;background:var(--m2-bg)}
      .m2-command{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .m2-command input{min-width:0;flex:1 1 160px;padding:7px 9px;border:1px solid var(--m2-line);border-radius:8px;background:var(--m2-bg);color:var(--m2-text);font:inherit}
      .m2-command input:focus-visible{outline:2px solid var(--m2-accent);outline-offset:1px}
      @media(max-width:800px){.m2-grid{grid-template-columns:minmax(0,1fr)}}
      @media(max-width:540px){.m2-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.m2-wrap{gap:12px}.m2-card,.m2-stat,.m2-notice{padding:12px}.m2-trend{height:129px}}
    `;

    function Icon({ size = 16 }) {
      return h('span', { 'aria-hidden': true, style: {
        display: 'inline-grid', gridTemplateColumns: 'repeat(3, 1fr)', alignItems: 'end', gap: 2,
        width: size, height: size, padding: 1, color: 'currentColor',
      } }, ...[45, 69, 100].map(height => h('i', { key: height, style: {
        display: 'block', height: `${height}%`, borderRadius: 1, background: 'currentColor',
      } })));
    }

    function StudyWriteStatus({ phase, t }) {
      return h('span', { style: { fontSize: 12 } }, t(phase === 'result' ? 'writeSettled' : 'writeInProgress'));
    }

    async function studyGet(path, signal) {
      const url = `api/dsh-math2-study/${path}`;
      const options = { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal };
      const transport = window.__DSH_TRANSPORT__;
      const response = transport?.fetch
        ? await transport.fetch(url, options)
        : await window.fetch(new URL(url, document.baseURI), options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }

    async function fetchDashboard(signal) {
      const snapshot = await studyGet('dashboard', signal);
      if (!snapshot.counts || !Array.isArray(snapshot.chapters) || !Array.isArray(snapshot.series)) throw new Error('Invalid dashboard data');
      return snapshot;
    }

    async function fetchDetail({ id, kind }, signal) {
      const idPattern = kind === 'review' ? /^R-\d{4,}$/ : /^A-\d{4,}$/;
      if (!idPattern.test(id)) throw new Error('Invalid study record ID');
      const record = await studyGet(`detail?id=${encodeURIComponent(id)}`, signal);
      if (record?.id !== id || record.kind !== kind || typeof record.statement !== 'string') throw new Error('Invalid study detail');
      return record;
    }

    function Pill({ type, label }) {
      return h('span', { className: `m2-pill ${type}` }, label);
    }

    function Card({ title, tools, children }) {
      return h('section', { className: 'm2-card' },
        h('div', { className: 'm2-card-header' }, h('h2', null, title), tools), children);
    }

    function Filter({ options, selected, set, t }) {
      return h('div', { className: 'm2-filters' }, options.map(([value, label]) =>
        h('button', { className: 'm2-button', key: value, type: 'button', 'aria-pressed': value === selected,
          onClick: () => set(value) }, t(label))));
    }

    function Trend({ rows, t }) {
      if (rows.every(row => row.attempts === 0)) return h('div', { className: 'm2-empty' }, t('nonePractice'));
      const max = Math.max(1, ...rows.map(row => row.attempts));
      return h(ReactFragment, null,
        h('div', { className: 'm2-trend', role: 'list', 'aria-label': t('practice') }, rows.map((row, index) => {
          const label = `${row.day} · ${t('attempts')} ${row.attempts} · ${t('independent')} ${row.independent}`;
          return h('div', { key: row.day, className: 'm2-day', role: 'listitem', 'aria-label': label, title: label },
            h('div', { className: 'm2-bar', style: { height: `${Math.max(2, row.attempts * 81 / max)}%` } },
              h('i', { style: { height: `${row.attempts ? row.independent * 100 / row.attempts : 0}%` } })),
            h('time', { dateTime: row.day, 'aria-hidden': true }, index % 3 === 0 || index === rows.length - 1 ? row.day.slice(5) : ' '));
        })),
        h('div', { className: 'm2-subtle m2-legend' },
          h('span', null, h('i', { className: 'm2-dot' }), t('attempts')),
          h('span', null, h('i', { className: 'm2-dot on' }), t('independent'))));
    }

    function List({ rows, empty, render }) {
      return rows.length ? h('ul', { className: 'm2-list' }, rows.map(render)) : h('div', { className: 'm2-empty' }, empty);
    }

    function DetailSection({ title, text }) {
      return h('section', { className: 'm2-detail-section' },
        h('h3', null, title), h('p', { className: 'm2-detail-text' }, text));
    }

    function ReviewCommand({ id, t }) {
      const input = useRef(null);
      const [status, setStatus] = useState(null);
      const command = `开始复习 ${id}`;
      async function copy() {
        try {
          await window.navigator.clipboard.writeText(command);
          setStatus('copiedReview');
        } catch {
          input.current?.focus();
          input.current?.select();
          setStatus('manualCopy');
        }
      }
      return h('div', { className: 'm2-detail-section' },
        h('p', { className: 'm2-subtle' }, t('reviewHandoff')),
        h('div', { className: 'm2-command' },
          h('input', { ref: input, readOnly: true, value: command, 'aria-label': t('reviewCommand') }),
          h('button', { className: 'm2-button', type: 'button', onClick: copy }, t('copyReview'))),
        h('p', { className: 'm2-subtle', role: 'status' }, status ? t(status) : ''));
    }

    function timeLabel(value, timeZone, t) {
      if (!value) return t('unknown');
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return t('unknown');
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short', timeZone }).format(date);
    }

    function DetailBody({ record, timeZone, t }) {
      const review = record.kind === 'review';
      const completed = review && record.status === 'completed';
      return h(ReactFragment, null,
        h('h3', null, record.title || record.questionId),
        h('div', { className: 'm2-detail-meta' },
          h('span', { className: 'm2-subtle' }, `${record.chapter} · ${record.questionId}`),
          review
            ? h(Pill, { type: 'priority', label: t(record.reviewKind === 'variant' ? 'variantReview' : 'originalReview') })
            : h(Pill, { type: record.result, label: t(record.result) }),
          review && record.status === 'needs_review' && h(Pill, { type: 'priority', label: t('reviewNeedsCheck') }),
          completed && h(Pill, { type: 'independent_correct', label: t('reviewCompleted') })),
        review && record.reviewKind === 'variant' &&
          h('p', { className: 'm2-subtle' }, `${t('sourceQuestion')} ${record.sourceQuestionId}`),
        review && h('p', { className: 'm2-subtle' }, `${record.due} · ${record.minutes} ${t('min')} · ${record.priority}`),
        !review && record.source && h('p', { className: 'm2-subtle' }, `${t('source')} · ${record.source}`),
        h(DetailSection, { title: t('statement'), text: record.statement }),
        review
          ? !completed && h(ReviewCommand, { id: record.id, t })
          : h(ReactFragment, null,
            h(DetailSection, { title: t('originalAnswer'), text: record.answer ?? t('unknown') }),
            record.diagnostic && h(DetailSection, { title: t('diagnosis'), text: record.diagnostic }),
            record.confirmedCause && h(DetailSection, { title: t('causes'), text: record.confirmedCause }),
            h('p', { className: 'm2-subtle' }, `${t('occurredAt')} · ${timeLabel(record.occurredAt, timeZone, t)}`),
            h('p', { className: 'm2-subtle' }, `${t('recordedAt')} · ${timeLabel(record.recordedAt, timeZone, t)}`)));
    }

    function DetailDialog({ selection, fallback, dismiss, timeZone, t }) {
      const dialog = useRef(null);
      const closeButton = useRef(null);
      const [record, setRecord] = useState(null);
      const [failed, setFailed] = useState(false);
      const [revision, setRevision] = useState(0);
      const { trigger, kind, id } = selection;

      useEffect(() => {
        const modal = dialog.current;
        modal.showModal();
        closeButton.current.focus();
        return () => {
          modal.close();
          (trigger.isConnected ? trigger : fallback.current)?.focus({ preventScroll: true });
        };
      }, [trigger, fallback]);

      useEffect(() => {
        const controller = new AbortController();
        async function load() {
          try {
            const result = await fetchDetail({ id, kind }, controller.signal);
            if (!controller.signal.aborted) setRecord(result);
          } catch {
            if (!controller.signal.aborted) setFailed(true);
          }
        }
        void load();
        return () => controller.abort();
      }, [id, kind, revision]);

      function retry() {
        setFailed(false);
        setRevision(value => value + 1);
      }

      return h('dialog', {
        ref: dialog, className: 'm2-dialog', 'aria-labelledby': 'm2-detail-title',
        onCancel: event => { event.preventDefault(); dismiss(); },
      },
      h('header', { className: 'm2-detail-header' },
        h('h2', { id: 'm2-detail-title' }, `${t(kind === 'review' ? 'reviewTitle' : 'attemptTitle')} · ${id}`),
        h('button', { ref: closeButton, className: 'm2-button', type: 'button', onClick: dismiss }, t('close'))),
      h('div', { className: 'm2-detail-body' },
        record ? h(DetailBody, { record, timeZone, t })
          : failed ? h('div', { className: 'm2-detail-section' },
            h('p', { role: 'status' }, t('detailError')),
            h('button', { className: 'm2-button', type: 'button', onClick: retry }, t('retry')))
            : h('p', { role: 'status' }, t('detailLoading'))));
    }

    function Dashboard({ t }) {
      const [snapshot, setSnapshot] = useState(null);
      const [error, setError] = useState(false);
      const [loading, setLoading] = useState(true);
      const [request, setRequest] = useState(0);
      const [days, setDays] = useState(14);
      const [group, setGroup] = useState('');
      const [selection, setSelection] = useState(null);
      const heading = useRef(null);
      const refresh = useCallback(() => { setLoading(true); setRequest(value => value + 1); }, []);
      const dismiss = useCallback(() => setSelection(null), []);

      function detailButton(kind, item) {
        const action = t(kind === 'review' ? 'startReview' : 'viewAttempt');
        return h('button', { className: 'm2-button', type: 'button',
          'aria-label': `${action} · ${item.title ?? item.id}`,
          onClick: event => setSelection({ kind, id: item.id, trigger: event.currentTarget }),
        }, action);
      }

      useEffect(() => {
        const controller = new AbortController();
        let active = false;
        async function load() {
          if (active) return;
          active = true;
          try {
            const data = await fetchDashboard(controller.signal);
            if (!controller.signal.aborted) { setSnapshot(data); setError(false); }
          } catch {
            if (!controller.signal.aborted) setError(true);
          } finally {
            active = false;
            if (!controller.signal.aborted) setLoading(false);
          }
        }
        void load();
        const timer = window.setInterval(load, 15000);
        return () => { controller.abort(); window.clearInterval(timer); };
      }, [request]);

      const metrics = snapshot && [
        ['coverage', snapshot.counts.learned, ` / ${snapshot.chapters.length}`],
        ['attempts', snapshot.counts.attempts, ''], ['errors', snapshot.counts.errors, ''], ['due', snapshot.counts.due, ''],
      ];
      return h('div', { className: 'm2-page' }, h('style', null, styles),
        selection && h(DetailDialog, { key: selection.id, selection, fallback: heading, dismiss, timeZone: snapshot?.timeZone, t }),
        h('div', { className: 'm2-wrap' },
          h('header', { className: 'm2-heading' },
            h('div', null, h('div', { className: 'm2-kicker' }, t('panel')), h('h1', { ref: heading, tabIndex: -1 }, t('heading')),
              snapshot && h('div', { className: 'm2-goals m2-subtle' },
                snapshot.target.examYear && h('span', null, `${t('examYear')} ${snapshot.target.examYear}`),
                snapshot.target.score !== null && h('span', null, `${t('score')} ${snapshot.target.score}`))),
            h('button', { className: 'm2-button', type: 'button', disabled: loading, onClick: refresh }, t('refresh'))),
          error && h('div', { className: 'm2-notice m2-error', role: 'status' }, t(snapshot ? 'stale' : 'failure')),
          !snapshot && loading && h('div', { className: 'm2-notice', role: 'status' }, t('loading')),
          snapshot && !snapshot.initialized && h('div', { className: 'm2-notice' },
            h('h2', null, t('emptyTitle')), h('p', { className: 'm2-subtle' }, t('emptyText'))),
          snapshot && h(ReactFragment, null,
            h('section', { className: 'm2-stats', 'aria-label': t('panel') }, metrics.map(([label, value, suffix]) =>
              h('div', { className: 'm2-stat', key: label }, h('span', { className: 'm2-subtle' }, t(label)),
                h('strong', null, value, suffix && h('small', null, suffix))))),
            h('div', { className: 'm2-grid' },
              h(Card, { title: t('practice'), tools: h(Filter, { options: [[7, 'week'], [14, 'fortnight']], selected: days, set: setDays, t }) },
                h(Trend, { rows: snapshot.series.slice(-days), t })),
              h(Card, { title: t('reviews') },
                h(List, { rows: snapshot.dueReviews, empty: t('noneReview'), render: review =>
                  h('li', { className: 'm2-lineitem', key: review.id }, h('div', null, h('strong', null, review.title),
                    h('span', { className: 'm2-subtle' }, `${review.due} · ${review.minutes} ${t('min')}`,
                      review.reviewKind === 'variant' && ` · ${t('variantReview')}`,
                      review.status === 'needs_review' && ` · ${t('reviewNeedsCheck')}`)),
                    h('div', { className: 'm2-row-actions' },
                      h(Pill, { type: 'priority', label: review.priority }), detailButton('review', review))) }),
                h('div', { className: 'm2-subtle' }, `${t('upcoming')} ${snapshot.upcomingReviews}`,
                  snapshot.counts.due > snapshot.dueReviews.length && ` · ${t('more')} ${snapshot.counts.due - snapshot.dueReviews.length} ${t('pending')}`))),
            h('div', { className: 'm2-grid' },
              h(Card, { title: t('chapters'), tools: h(Filter, {
                options: [['', 'all'], ['GS', 'calculus'], ['LA', 'algebra']], selected: group, set: setGroup, t,
              }) }, h(List, { rows: snapshot.chapters.filter(chapter => chapter.id.startsWith(group)), render: chapter =>
                h('li', { className: 'm2-lineitem', key: chapter.id }, h('div', null, h('strong', null, chapter.title),
                  h('span', { className: 'm2-subtle' }, chapter.id)), h('div', { className: 'm2-coverage' },
                  h(Pill, { type: chapter.coverage, label: t(chapter.coverage) }),
                  h('span', { className: 'm2-subtle' }, chapter.needsReview ? t('reassess') : chapter.mastery === null ? t('noMastery')
                    : `${chapter.masteryTarget} · ${chapter.mastery}/5 · ${chapter.evidenceCount} ${t('evidence')}`))) })),
              h('div', { style: { display: 'grid', gap: 14, minWidth: 0 } },
                h(Card, { title: t('causes') }, h(List, { rows: snapshot.causes, empty: t('noneCause'), render: cause =>
                  h('li', { key: cause.label, className: 'm2-lineitem' }, h('strong', null, cause.label),
                    h('span', { className: 'm2-subtle' }, `${cause.distinct} ${t('distinct')}`)) })),
                h(Card, { title: t('recent') }, h(List, { rows: snapshot.recent, empty: t('noneRecent'), render: attempt =>
                  h('li', { key: attempt.id, className: 'm2-lineitem' }, h('div', null, h('strong', null, attempt.title),
                    h('span', { className: 'm2-subtle' }, `${attempt.chapter} · ${attempt.id}`)),
                    h('div', { className: 'm2-row-actions' },
                      h(Pill, { type: attempt.result, label: t(attempt.result) }), detailButton('attempt', attempt))) })))),
            snapshot.initialized && h('div', { className: 'm2-subtle m2-foot' },
              `${t('revision')} ${snapshot.revision} · ${snapshot.today} · ${snapshot.timeZone}`))));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(panelId, labels), 'math2: locale');
        const t = ctx.locale.bind(panelId);
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panelId, locale: panelId }, Dashboard));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: panelId, order: 15, label: () => t('panel'), locale: panelId,
        }, Icon));
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview', key: 'math2_write', locale: panelId,
        }, StudyWriteStatus));
      },
    };
  },
});
