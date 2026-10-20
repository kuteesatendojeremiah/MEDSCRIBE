"""PDF rendering with ReportLab, straight from the same document model as the DOCX (Blueprint §4.3, §12.1).

Pure Python and entirely in memory: no LibreOffice, no temp files, no profile directory to clean up.
The built-in Helvetica font covers Western European text; characters it cannot draw (for example the
subscript in SpO2) are replaced by safe equivalents so nothing prints as a black box.
"""

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.render.model import Document

NAVY = colors.HexColor("#1F4E79")
RED = colors.HexColor("#C00000")
GREY = colors.HexColor("#596373")
SHADE = colors.HexColor("#E4EDF7")

SUBSTITUTIONS = {
    "₂": "2",
    "–": "-",
    "—": "-",
    "→": "->",
    "✓": "",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
}


def printable(text: str) -> str:
    """Make text safe for the built-in font: map known symbols, replace anything else outside Latin-1."""
    for bad, good in SUBSTITUTIONS.items():
        text = text.replace(bad, good)
    return "".join(ch if ord(ch) < 256 else "?" for ch in text)


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(printable(text)), style)


def render_pdf(doc: Document) -> bytes:
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=12.5, spaceAfter=2)
    unverified = ParagraphStyle("unv", parent=body, fontName="Helvetica-Bold", textColor=RED)
    heading = ParagraphStyle(
        "h",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=NAVY,
        spaceBefore=9,
        spaceAfter=2,
    )
    title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=NAVY)
    demo = ParagraphStyle(
        "d", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=RED, spaceAfter=5
    )
    label = ParagraphStyle("l", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=NAVY)

    story = [_p(doc.title, title)]
    if doc.demo_line:
        story.append(_p(doc.demo_line, demo))
    rows = [[_p(k, label), _p(v, body)] for k, v in doc.header_rows]
    table = Table(rows, colWidths=[3.2 * cm, 14.2 * cm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#B8C2D4")),
                ("BACKGROUND", (0, 0), (0, -1), SHADE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story += [table, Spacer(1, 4)]

    for sec in doc.sections:
        story.append(_p(sec.title, heading))
        for ln in sec.lines:
            story.append(
                _p(
                    ("UNVERIFIED: " + ln.text) if ln.unverified else ln.text,
                    unverified if ln.unverified else body,
                )
            )
    story.append(_p("REVIEW ITEMS", heading))
    for ln in doc.review:
        story.append(_p(ln.text, unverified if ln.unverified else body))

    def footer(canvas, pdf):
        canvas.saveState()
        canvas.setFont("Helvetica-Oblique", 7.5)
        canvas.setFillColor(GREY)
        text = printable(doc.footer)
        words, line, lines = text.split(), "", []
        for w in words:  # wrap the footer over the page width
            if canvas.stringWidth(line + " " + w, "Helvetica-Oblique", 7.5) > A4[0] - 3.6 * cm:
                lines.append(line)
                line = w
            else:
                line = (line + " " + w).strip()
        lines.append(line)
        for i, ln in enumerate(lines):
            canvas.drawString(1.8 * cm, 1.1 * cm + (len(lines) - 1 - i) * 9, ln)
        canvas.restoreState()

    buf = io.BytesIO()
    SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.5 * cm,
        bottomMargin=2.1 * cm,
        title="Consultation note",
        author="Mediscribe",
        pageCompression=0,  # keeps the text searchable and the tests able to read it
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
