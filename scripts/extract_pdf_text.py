from __future__ import annotations

from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    pdf_path = repo_root / "Problem_statement.pdf"
    out_path = repo_root / "docs" / "problem_statement_extracted.txt"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    text: str | None = None
    errors: list[str] = []

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(pdf_path))
        parts: list[str] = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            parts.append(f"\n\n--- PAGE {i + 1} ---\n\n" + page_text)
        text = "".join(parts)
    except Exception as e:  # pragma: no cover
        errors.append(f"pypdf failed: {e}")

    if text is None:
        try:
            from pdfminer.high_level import extract_text  # type: ignore

            text = extract_text(str(pdf_path))
        except Exception as e:  # pragma: no cover
            errors.append(f"pdfminer failed: {e}")

    if text is None:
        raise SystemExit("Could not extract PDF text. Errors: " + " | ".join(errors))

    out_path.write_text(text, encoding="utf-8")
    print(f"Wrote {out_path.relative_to(repo_root)} ({len(text)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
