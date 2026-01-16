"""Document converter - converts Word docs to PDF using LibreOffice."""
import asyncio
import logging
import tempfile
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

CONVERTIBLE_EXTENSIONS = {'.docx', '.doc'}


def is_convertible(filename: str) -> bool:
    """Check if file is a Word document that can be converted."""
    return Path(filename).suffix.lower() in CONVERTIBLE_EXTENSIONS


def is_pdf(filename: str) -> bool:
    """Check if file is already a PDF."""
    return Path(filename).suffix.lower() == '.pdf'


async def convert_to_pdf(content: bytes, filename: str) -> tuple[bytes, str]:
    """Convert Word doc to PDF using LibreOffice.

    Args:
        content: Raw bytes of the Word document
        filename: Original filename (used for extension detection)

    Returns:
        Tuple of (pdf_bytes, new_filename)

    Raises:
        RuntimeError: If LibreOffice not installed or conversion fails
    """
    soffice = shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice:
        raise RuntimeError(
            "LibreOffice not installed. Add NIXPACKS_PKGS=libreoffice-still "
            "to Railway environment variables."
        )

    with tempfile.TemporaryDirectory(prefix="docconvert_") as tmp:
        tmp_path = Path(tmp)
        input_file = tmp_path / f"input{Path(filename).suffix}"
        input_file.write_bytes(content)

        proc = await asyncio.create_subprocess_exec(
            soffice, '--headless', '--invisible', '--nologo',
            '--nofirststartwizard', '--convert-to', 'pdf',
            '--outdir', str(tmp_path), str(input_file),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError("PDF conversion timed out after 120 seconds")

        if proc.returncode != 0:
            error_msg = stderr.decode('utf-8', errors='replace') if stderr else 'Unknown error'
            logger.error(f"LibreOffice conversion failed: {error_msg}")
            raise RuntimeError(f"PDF conversion failed: {error_msg}")

        pdf_file = tmp_path / "input.pdf"
        if not pdf_file.exists():
            # Search for any PDF in case LibreOffice used different naming
            pdf_files = list(tmp_path.glob("*.pdf"))
            if not pdf_files:
                raise RuntimeError("Conversion completed but no PDF was generated")
            pdf_file = pdf_files[0]

        pdf_content = pdf_file.read_bytes()
        if len(pdf_content) == 0:
            raise RuntimeError("Conversion produced an empty PDF")

        new_filename = Path(filename).stem + '.pdf'
        logger.info(f"Converted {filename} to PDF ({len(content)} -> {len(pdf_content)} bytes)")

        return pdf_content, new_filename


async def ensure_pdf(content: bytes, filename: str) -> tuple[bytes, str, bool]:
    """Ensure file is PDF format, converting if necessary.

    Args:
        content: Raw file bytes
        filename: Original filename

    Returns:
        Tuple of (content, filename, was_converted)
        - content: PDF bytes (original if already PDF, converted otherwise)
        - filename: Filename (unchanged if PDF, .pdf extension if converted)
        - was_converted: True if conversion was performed

    Raises:
        ValueError: If file type is not supported (not PDF or Word)
        RuntimeError: If conversion fails
    """
    if is_pdf(filename):
        return content, filename, False

    if is_convertible(filename):
        pdf_bytes, pdf_name = await convert_to_pdf(content, filename)
        return pdf_bytes, pdf_name, True

    ext = Path(filename).suffix.lower()
    raise ValueError(f"Unsupported file type: {ext}. Supported: .pdf, .docx, .doc")
