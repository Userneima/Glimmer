// 手机上弹出键盘时，100vh / 100dvh 都不会变矮（iOS Safari 和 Android Chrome 默认都只缩
// visual viewport）。整个界面因此有一截压在键盘下面，编辑区的滚动框也延伸到键盘底下；
// ProseMirror 判断光标还在滚动框里就不滚它，转而去滚 window，而它算窗口范围时不看
// visualViewport.offsetTop，每打一个字都再往下推一次，最后整页被推到最底部。
// 这里把界面高度跟着 visual viewport 走，并把 window 钉回顶部，滚动只发生在界面内部。

const APP_HEIGHT_VAR = '--app-height';

export function startViewportHeightSync(): void {
  const vp = window.visualViewport;
  if (!vp) return;

  const root = document.documentElement;
  let frame = 0;

  const apply = () => {
    frame = 0;
    root.style.setProperty(APP_HEIGHT_VAR, `${Math.round(vp.height)}px`);
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };

  vp.addEventListener('resize', schedule);
  vp.addEventListener('scroll', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  apply();
}
