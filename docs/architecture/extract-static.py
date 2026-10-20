#!/usr/bin/env python3
"""Extract portable dark SVGs from Archify HTML without executing its JS."""
import re,json,pathlib,xml.etree.ElementTree as E
p=pathlib.Path(__file__).resolve().parent
for f in sorted(p.glob('*.html')):
 slug=f.stem;lang='zh-CN' if slug.endswith('zh-CN') else 'en';s=f.read_text();d=json.loads((p/(slug+'.json')).read_text())
 a=s.index('<svg viewBox=');b=s.index('</svg>',a)+6;svg=s[a:b]
 # Preserve the generated SVG topology; freeze semantic styles for portable image viewers.
 svg=re.sub(r'<style>.*?</style>','',svg,flags=re.S)
 theme=re.search(r'\[data-theme="dark"\] \{(.*?)\n    \}',s,re.S).group(1)
 variables=dict(re.findall(r'--([\w-]+):\s*([^;]+);',theme))
 signal=re.search(r'\[data-preset="signal-flow"\]\[data-theme="dark"\] \{(.*?)\n    \}',s,re.S).group(1)
 variables.update(dict(re.findall(r'--([\w-]+):\s*([^;]+);',signal)))
 for k,v in list(variables.items()):
  if v.startswith('rgba('):
   r,g,b,a=map(float,re.findall(r'[0-9.]+',v));variables[k]='#'+''.join(f'{round(c*a+base*(1-a)):02x}' for c,base in zip([r,g,b],[7,16,30]))
 css=[]
 for selector,body in re.findall(r'(\.[acmt]-[\w-]+)\s*\{([^}]+)\}',s):
  if 'var(' in body:
   body=re.sub(r'var\(--([\w-]+)\)',lambda m:variables.get(m[1],'#64748b'),body)
   if selector not in [x[0] for x in css]:css.append((selector,body))
 svg=re.sub(r'var\(--([\w-]+)\)',lambda m:variables.get(m[1],'#64748b'),svg)
 root=E.fromstring(svg);w,h=map(float,root.get('viewBox').split()[2:]);root.set('xmlns','http://www.w3.org/2000/svg');root.set('width',str(int(w)));root.set('height',str(int(h+165)));root.set('viewBox',f'0 0 {w:g} {h+165:g}')
 root.insert(0,E.Element('rect',{'width':'100%','height':'100%','fill':'#030711'}))
 style=E.Element('style');style.text='text {font-family: DejaVu Sans, Noto Sans CJK SC, sans-serif;} '+''.join(a+'{'+b+'}' for a,b in css)+'.semantic-sigil {fill:none;stroke:#9eb0c7;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}.sigil-fill{fill:#9eb0c7;stroke:none}.c-grid{stroke:#101c2d}'
 root.insert(1,style)
 # Place the untouched generated diagram below a readable heading.
 group=E.Element('g',{'transform':'translate(0 55)'})
 for child in list(root)[2:]:root.remove(child);group.append(child)
 root.append(group)
 def text(x,y,value,size,color='#f5fbff',weight='400'):
  e=E.SubElement(root,'text',{'x':str(x),'y':str(y),'font-size':str(size),'fill':color,'font-weight':weight});e.text=value
 text(40,34,d['meta']['title'],21,weight='650')
 zh=lang!='en'
 lines=['本地单用户 · 默认合成模式 · live 每次只选 WHOOP 或 Garmin','本地 TTY 授权；vault 加密，检查点明文。WHOOP 官方 OAuth/API；Garmin 非官方 Connect。','仅示意当前 CLI 装配；摘要返回调用方。授权成功不等于真实数据验收。'] if zh else ['Local, single-user · synthetic by default · one provider per live run','Local TTY authorization. Encrypted vault; plaintext checkpoint. WHOOP official OAuth/API; Garmin unofficial Connect.','Current CLI wiring only. Summaries return to the caller. Authorization alone is not live-data acceptance.']
 if slug.startswith('overview'):
  lines=['工具包负责接入与质量说明；你授权的外部 Agent 负责解释与报告。','厂商同步可能不完整。单用户本地授权，凭据加密；报告及 Agent 接收的数据需保护。','不内置长期档案、多设备自动融合或定时送达；不是诊断与治疗工具。'] if zh else ['The kit supplies access and quality context; your authorized external agent interprets and reports.','Vendor sync may be incomplete. Local single-user authorization; protect reports and data shared with the agent.','No built-in long-term archive, automatic multi-device fusion or scheduled delivery. No diagnosis or treatment.']
 if slug.startswith('architecture'):
  lines.append('当前限制：明文检查点仅用于合成/Garmin；WHOOP live 的 --output 被拒绝。' if zh else 'Current policy: plaintext checkpoints are for synthetic/Garmin; live WHOOP --output is rejected.')
 lines.append('GitHub 静态预览不播放动画；下载 HTML 可查看节点联动与流光。' if zh else 'GitHub previews are static. Download the HTML for linked highlighting and animated flow.')
 for i,line in enumerate(lines):text(40,h+72+i*18,line,11,'#9eb0c7')
 E.indent(root);(p/(slug+'.svg')).write_text(E.tostring(root,encoding='unicode')+'\n')
