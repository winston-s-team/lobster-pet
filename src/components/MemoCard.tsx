import './MemoCard.css'

interface Props {
  content: string | null
}

/** Minimal markdown → HTML converter (no deps) */
function renderMd(md: string): string {
  const html: string[] = []
  const lines = md.split('\n')
  let inList = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Close list if needed
    if (inList && !line.startsWith('- ') && !line.startsWith('* ')) {
      html.push('</ul>')
      inList = false
    }

    if (line.startsWith('## ')) {
      html.push(`<h3>${inline(line.slice(3))}</h3>`)
    } else if (line.startsWith('# ')) {
      html.push(`<h2>${inline(line.slice(2))}</h2>`)
    } else if (line.startsWith('### ')) {
      html.push(`<h4>${inline(line.slice(4))}</h4>`)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li>${inline(line.slice(2))}</li>`)
    } else if (line.match(/^\d+\.\s/)) {
      if (!inList) { html.push('<ol>'); inList = true }
      html.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`)
    } else if (line === '---') {
      html.push('<hr/>')
    } else if (line === '') {
      html.push('<br/>')
    } else {
      html.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) html.push(inList === true ? '</ul>' : '</ol>')

  return html.join('\n')
}

/** Inline formatting: bold, italic, code, links */
function inline(text: string): string {
  let s = text
  // Code blocks (inline)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  return s
}

export default function MemoCard({ content }: Props) {
  const dateStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="memo-card card">
      <div className="section-title">📝 今日小记 · {dateStr}</div>
      <div className="card-scroll">
        {content ? (
          <div className="memo-content" dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
        ) : (
          <div className="memo-empty">今天还没有工作记录</div>
        )}
      </div>
    </div>
  )
}
