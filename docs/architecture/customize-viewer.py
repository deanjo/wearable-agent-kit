#!/usr/bin/env python3
"""Apply documented WAK reader defaults to freshly rendered Archify HTML."""
from pathlib import Path
p=Path(__file__).resolve().parent
for f in sorted(p.glob('*.html')):
 lang='zh-CN' if f.stem.endswith('zh-CN') else 'en';s=f.read_text()
 # Migrate previously customized pages as well as freshly rendered output.
 s=s.replace('Choose a scenario below for offline, live-read or storage paths. ', '')
 s=s.replace('；用下方场景切换离线、真实读取与存储边界。', '。')
 if '<!-- WAK local sharing guard v1 -->' not in s:
  guard="location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname.endsWith('.localhost') || location.hostname === '127.0.0.1' || location.hostname === '[::1]'"
  s=s.replace('function readerLink(state) {', 'function readerLink(state) {\n      if ('+guard+') return null;')
  message=('本地图链接无法分享，请分享 HTML 文件。' if lang!='en' else 'Local links cannot be shared; share the HTML file instead.')
  code="<!-- WAK local sharing guard v1 --><script>(function(){if (!("+guard+")) return;var message="+repr(message)+";['btn-focus-copy','route-probe-copy','semantic-lens-copy'].forEach(function(id){var b=document.getElementById(id);if(b){b.disabled=true;b.title=message;b.setAttribute('aria-label',message);}});var hint=document.createElement('p');hint.className='wak-reader-hint';hint.textContent=message;var h=document.querySelector('.wak-reader-hint');if(h)h.after(hint);})();</script>"
  s=s.replace('</body>',code+'</body>')
 if '<!-- WAK reader defaults v1 -->' in s:
  f.write_text(s)
  continue
 # Retain URL/theme toggle overrides, but make the first visit dark.
 s=s.replace("window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'", "'dark'")
 s=s.replace("apply(e.matches ? 'light' : 'dark');", "apply('dark');")
 s=s.replace("'archify-theme'", "'wak-architecture-theme'")
 # Keep one Live/Still choice, persist an explicit pause, and honor reduced motion.
 s=s.replace("'archify-motion'", "'wak-architecture-motion'")
 s=s.replace("readerPaused = readStored() !== 'live';", "readerPaused = readStored() === 'still';")
 s=s.replace("if (readerPaused) localStorage.removeItem(STORAGE_KEY);", "if (readerPaused) localStorage.setItem(STORAGE_KEY, 'still');")
 css='''<!-- WAK reader defaults v1 -->
<style>
/* One authored visual style; animation remains one accessible Live/Still toggle. */
.toolbar .preset-wrap { display: none !important; }
.wak-reader-hint { max-width: 74rem; margin: .65rem auto 1.2rem; color: var(--text-muted); font-size: .86rem; line-height: 1.65; }
.wak-reader-hint strong { color: var(--text); }
html[data-theme="dark"] .diagram-container { box-shadow: 0 18px 70px rgba(0,0,0,.28), inset 0 0 0 1px rgba(103,232,249,.06); }
</style>
'''
 s=s.replace('</head>',css+'</head>')
 hint=('点击节点查看相邻关系。右上角可暂停动态。<strong>动画仅示意架构关系，不是实时同步或健康数据。</strong>' if lang!='en' else 'Select a node to highlight its neighbors. Pause motion in the toolbar. <strong>Animation illustrates architecture, not live sync or health data.</strong>')
 if f.stem.startswith('architecture'):
  hint += (' <strong>当前导出限制：明文检查点仅用于合成/Garmin；WHOOP live 的 --output 被拒绝。</strong>' if lang!='en' else ' <strong>Current export policy: plaintext checkpoints are for synthetic/Garmin only; live WHOOP --output is rejected.</strong>')
 if f.stem.startswith('overview'):
  hint=('点击节点查看数据如何流向下一步，以及相邻关系。右上角可暂停动态。<strong>动画不是实时健康数据；Agent 分析是外部职责。</strong>' if lang!='en' else 'Select a node to explore its connected data path. Pause motion in the toolbar. <strong>This is not live health data; agent analysis is an external responsibility.</strong>')
 s=s.replace('</h1>','</h1><p class="wak-reader-hint">'+hint+'</p>',1)
 f.write_text(s)
