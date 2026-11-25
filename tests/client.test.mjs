import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const snapshot = {
  initialized: true, counts: { learned: 0, attempts: 1, errors: 0, due: 1 },
  chapters: [], series: [], target: {}, causes: [], upcomingReviews: 0, timeZone: 'Asia/Shanghai',
  dueReviews: [{ id: 'R-0001', title: 'Review', due: '2026-11-25', minutes: 10, priority: 'P2', reviewKind: 'variant' }],
  recent: [{ id: 'A-0001', title: 'Attempt', chapter: 'GS01', result: 'wrong' }],
};

function mountClient(fetch) {
  let active;
  let bundle;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    Fragment: Symbol('Fragment'),
    useCallback: callback => callback,
    useRef(value) {
      const slot = active.cursor++;
      return active.hooks[slot] ??= { current: value };
    },
    useState(value) {
      const view = active;
      const slot = view.cursor++;
      const state = view.hooks[slot] ??= { value };
      return [state.value, update => {
        view.updates++;
        state.value = typeof update === 'function' ? update(state.value) : update;
      }];
    },
    useEffect(effect, deps) {
      const view = active;
      const slot = view.cursor++;
      const previous = view.hooks[slot];
      if (previous?.deps.every((dep, index) => Object.is(dep, deps[index]))) return;
      view.effects.push(() => {
        previous?.cleanup?.();
        view.hooks[slot] = { deps, cleanup: effect() };
      });
    },
  };
  vm.runInNewContext(source, {
    AbortController, encodeURIComponent,
    window: {
      __ModuleLoader__: { load(spec) { bundle = spec.factory(() => React); } },
      __DSH_TRANSPORT__: { fetch }, setInterval() { return 1; }, clearInterval() {},
    },
  });
  let Dashboard;
  bundle.apply({
    effect(fn) { fn(); }, locale: { register() {}, bind: () => key => key },
    slots: { inject(_name, fn) { fn(); }, register(spec, component) { if (spec.name === 'main') Dashboard = component; } },
  });
  return {
    start(props = { t: key => key }) { return mount(Dashboard, props); },
    mount,
  };

  function mount(component, props) {
    const view = {
      cursor: 0, hooks: [], effects: [], updates: 0,
      render() {
        active = view;
        view.cursor = 0;
        return component(props);
      },
      commit() { for (const effect of view.effects.splice(0)) effect(); },
      dispose() { for (const hook of view.hooks) hook.cleanup?.(); },
    };
    return view;
  }
}

function find(tree, predicate) {
  if (!tree) return undefined;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  if (predicate(tree)) return tree;
  return tree.children?.map(child => find(child, predicate)).find(Boolean);
}

function button(tree, text) {
  return find(tree, node => node.type === 'button' && node.children[0] === text);
}

const json = value => ({ ok: true, json: async () => value });
const resolveLater = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function openRecord(client, dashboard, id, action) {
  const list = find(dashboard.render(), entry => entry.props?.rows?.some(row => row.id === id));
  const row = list.props.render(list.props.rows.find(item => item.id === id));
  const trigger = { isConnected: true, focusCalls: 0, focus() { this.focusCalls++; } };
  button(row, action).props.onClick({ currentTarget: trigger });
  const element = find(dashboard.render(), entry => entry.props?.selection?.id === id);
  const detail = client.mount(element.type, element.props);
  const dialog = detail.render();
  const native = { showed: false, closed: false, showModal() { this.showed = true; }, close() { this.closed = true; } };
  const close = { focused: false, focus() { this.focused = true; } };
  dialog.props.ref.current = native;
  button(dialog, 'close').props.ref.current = close;
  detail.commit();
  return { element, detail, dialog, native, trigger, close };
}

test('review and attempt buttons load their own detail; closing aborts a stale review response', async () => {
  const staleReview = resolveLater();
  const fetches = [];
  const client = mountClient(async (path, request) => {
    fetches.push({ path, request });
    if (path.endsWith('/dashboard')) return json(snapshot);
    if (path.endsWith('R-0001')) return staleReview.promise;
    return json({ kind: 'attempt', id: 'A-0001', statement: 'Actual problem', answer: '<script>verbatim</script>' });
  });
  const dashboard = client.start();
  dashboard.render();
  dashboard.commit();
  await setImmediate();

  const old = openRecord(client, dashboard, 'R-0001', 'startReview');
  assert.equal(old.native.showed, true);
  assert.equal(old.close.focused, true);
  assert.equal(old.dialog.props['aria-labelledby'], 'm2-detail-title');
  assert.equal(fetches[1].path, 'api/dsh-math2-study/detail?id=R-0001');
  old.dialog.props.onCancel({ preventDefault() {} });
  old.detail.dispose();
  assert.equal(fetches[1].request.signal.aborted, true);
  assert.equal(old.trigger.focusCalls, 1);

  const current = openRecord(client, dashboard, 'A-0001', 'viewAttempt');
  assert.equal(fetches[2].path, 'api/dsh-math2-study/detail?id=A-0001');
  assert.equal(fetches[2].request.method, 'GET');
  staleReview.resolve(json({ kind: 'review', id: 'R-0001', statement: 'Old problem' }));
  await setImmediate();
  assert.equal(old.detail.updates, 0);
  const ready = find(current.detail.render(), entry => entry.props?.record?.id === 'A-0001');
  const body = ready.type(ready.props);
  const answer = find(body, entry => entry.props?.title === 'originalAnswer');
  assert.deepEqual(answer.type(answer.props).children[1].children, ['<script>verbatim</script>']);
  current.detail.dispose();
  dashboard.dispose();
});

test('a mismatched detail is rejected and retry opens the assigned variant', async () => {
  let detailReads = 0;
  const client = mountClient(async path => {
    if (path.endsWith('/dashboard')) return json(snapshot);
    if (++detailReads === 1) return json({ kind: 'review', id: 'R-9999', statement: 'Wrong problem' });
    return json({ kind: 'review', id: 'R-0001', questionId: 'Q-0002', sourceQuestionId: 'Q-0001',
      reviewKind: 'variant', statement: 'Assigned variant', solution: 'Hidden solution' });
  });
  const dashboard = client.start();
  dashboard.render();
  dashboard.commit();
  await setImmediate();
  const task = openRecord(client, dashboard, 'R-0001', 'startReview');
  await setImmediate();
  button(task.detail.render(), 'retry').props.onClick();
  task.detail.render();
  task.detail.commit();
  await setImmediate();
  const ready = find(task.detail.render(), entry => entry.props?.record?.id === 'R-0001');
  const body = ready.type(ready.props);
  assert.equal(find(body, entry => entry.props?.title === 'statement').props.text, 'Assigned variant');
  assert.equal(find(body, entry => entry === 'Hidden solution'), undefined);
  const command = find(body, entry => entry.props?.id === 'R-0001');
  const commandView = client.mount(command.type, command.props).render();
  assert.equal(find(commandView, entry => entry.type === 'input').props.value, '开始复习 R-0001');
  task.detail.dispose();
  dashboard.dispose();
});
