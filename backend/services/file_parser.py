import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def parse_pdf(content: bytes) -> str:
    try:
        import pdfplumber

        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts).strip()
    except Exception as exc:
        logger.error(f"PDF parse error: {exc}")
        return ""


def parse_docx(content: bytes) -> str:
    try:
        from docx import Document

        doc = Document(io.BytesIO(content))
        lines = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(lines).strip()
    except Exception as exc:
        logger.error(f"DOCX parse error: {exc}")
        return ""


def parse_resume(content: bytes, filename: str) -> Optional[str]:
    name = filename.lower()
    if name.endswith(".pdf"):
        return parse_pdf(content)
    if name.endswith(".docx") or name.endswith(".doc"):
        return parse_docx(content)
    if name.endswith(".txt"):
        return content.decode("utf-8", errors="ignore").strip()
    # Fallback: try PDF then DOCX
    text = parse_pdf(content)
    return text or parse_docx(content)
