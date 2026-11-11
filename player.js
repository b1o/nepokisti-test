// A floating YouTube player for the static snapshot of the world page.
// A click on a time link (00:12:34) opens the player 10 s before that time. A click on another time
// of the same video jumps inside the loaded player through YouTube's postMessage protocol, so no
// YouTube script runs in this page. Any other case loads the embed again at the time.
(() => {
  const ORIGIN = 'https://www.youtube-nocookie.com';
  const LEAD = 10;
  let panel = null;
  let frame = null;
  let label = null;
  let playing = null; // the video that the player reports
  let ready = false;
  let handshake = 0;

  const clock = (t) => [t / 3600, (t % 3600) / 60, t % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');

  function parse(link) {
    if (!/^\d{2}:\d{2}:\d{2}$/.test(link.textContent.trim())) return null;
    let url;
    try { url = new URL(link.href); } catch { return null; }
    const v = url.searchParams.get('v') ?? '';
    const t = Number.parseInt((url.searchParams.get('t') ?? '0').replace(/s$/, ''), 10);
    if (!/^[A-Za-z0-9_-]{11}$/.test(v) || !Number.isFinite(t)) return null;
    return { v, t };
  }

  function send(message) {
    frame?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: 'widget' }), ORIGIN);
  }

  function onMessage(event) {
    if (event.origin !== ORIGIN || !frame || event.source !== frame.contentWindow) return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data || typeof data !== 'object' || data.channel !== 'widget') return;
    ready = true;
    clearInterval(handshake);
    const id = data.info?.videoData?.video_id;
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)) playing = id;
  }

  function load({ v, t }) {
    ready = false;
    playing = v;
    clearInterval(handshake);
    frame.src = `${ORIGIN}/embed/${v}?start=${Math.max(0, t - LEAD)}&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    frame.onload = () => {
      send({ event: 'listening' });
      handshake = setInterval(() => send({ event: 'listening' }), 250);
      setTimeout(() => clearInterval(handshake), 5000);
    };
  }

  function close() {
    clearInterval(handshake);
    window.removeEventListener('message', onMessage);
    panel?.remove();
    panel = frame = label = playing = null;
    ready = false;
  }

  function open(clip, title) {
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'snap-player';
      panel.setAttribute('aria-label', 'Video player');
      panel.innerHTML = '<header><span></span><button type="button">Close</button></header><div class="snap-frame"><iframe allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
      label = panel.querySelector('span');
      frame = panel.querySelector('iframe');
      panel.querySelector('button').addEventListener('click', close);
      document.body.append(panel);
      window.addEventListener('message', onMessage);
    }
    label.textContent = `${title} from ${clock(clip.t)}`;
    frame.title = label.textContent;
    if (ready && playing === clip.v) {
      send({ event: 'command', func: 'seekTo', args: [Math.max(0, clip.t - LEAD), true] });
      send({ event: 'command', func: 'playVideo', args: [] });
    } else {
      load(clip);
    }
  }

  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="https://www.youtube.com/watch"]');
    const clip = link && parse(link);
    if (!clip) return;
    event.preventDefault();
    // The title of the session: a link to its page, or this page when it is the session page.
    const sessionLink = document.querySelector(`a[href$="sessions/${clip.v}.html"]`);
    const ownPage = location.pathname.endsWith(`/sessions/${clip.v}.html`);
    const title = sessionLink?.textContent.trim() || (ownPage ? document.title.replace(/ - Nepokisti data bank$/, '') : 'Session video');
    open(clip, title);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel) close();
  });
})();
