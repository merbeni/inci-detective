// Minimal renderer for Gemini's answers: paragraphs, "* " bullet lists and
// **bold**, nothing else. Anything fancier the model emits degrades to plain
// text instead of showing raw markdown symbols.

function renderInline(text, keyBase) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyBase}-${i}`}>{part}</strong> : part
  )
}

export default function AiText({ text }) {
  if (!text) return null
  const blocks = []
  let list = null
  const lines = text.split('\n')

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[*-]\s+(.*)$/)
    if (bullet) {
      if (!list) {
        list = []
        blocks.push({ type: 'ul', items: list, key: `ul-${i}` })
      }
      list.push(bullet[1])
    } else {
      list = null
      const trimmed = line.trim()
      if (trimmed) blocks.push({ type: 'p', text: trimmed, key: `p-${i}` })
    }
  })

  return (
    <>
      {blocks.map((b) =>
        b.type === 'ul' ? (
          <ul key={b.key} className="aitext__list">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, `${b.key}-${j}`)}</li>
            ))}
          </ul>
        ) : (
          <p key={b.key}>{renderInline(b.text, b.key)}</p>
        )
      )}
    </>
  )
}
