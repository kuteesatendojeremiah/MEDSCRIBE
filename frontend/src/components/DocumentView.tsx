// Renders the server's preview document model (Blueprint §12.1 step 2). Same model feeds the DOCX.
import type { PreviewDocument } from '../api/client'

export function DocumentView({ doc }: { doc: PreviewDocument }) {
  return (
    <article className="paper" aria-label="Rendered note preview">
      <h1>{doc.title}</h1>
      {doc.demo_line && <p className="demo-line">{doc.demo_line}</p>}
      <table className="paper-table">
        <tbody>
          {doc.header_rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc.sections.map((s) => (
        <section key={s.title}>
          <h4>{s.title}</h4>
          {s.lines.map((l, i) =>
            l.unverified ? (
              <p key={i} className="unverified">
                UNVERIFIED: {l.text}
              </p>
            ) : (
              <p key={i}>{l.text}</p>
            ),
          )}
        </section>
      ))}
      <section>
        <h4>REVIEW ITEMS</h4>
        {doc.review.map((l, i) => (
          <p key={i} className={l.unverified ? 'unverified' : undefined}>
            {l.text}
          </p>
        ))}
      </section>
      <footer>{doc.footer}</footer>
    </article>
  )
}
