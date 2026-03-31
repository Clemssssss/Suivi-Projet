"""
Génère Manuel_Dashboard_Analytics_v3.pdf depuis chart/manual.html
Dépendances : pip install playwright && python -m playwright install chromium

Usage :
    cd chart/docs
    python generate_manual_pdf.py
"""

import asyncio
import os
from pathlib import Path

async def generate():
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright non installé. Exécuter : pip install playwright && python -m playwright install chromium")
        return

    # Chemin vers manual.html (dossier parent du script)
    docs_dir = Path(__file__).parent
    chart_dir = docs_dir.parent
    manual_path = chart_dir / "manual.html"
    output_path = docs_dir / "Manuel_Dashboard_Analytics_v3.pdf"

    if not manual_path.exists():
        print(f"Fichier introuvable : {manual_path}")
        return

    file_url = manual_path.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        print(f"Chargement de : {file_url}")
        await page.goto(file_url, wait_until="networkidle")

        # Injecter les styles d'impression pour un PDF propre
        await page.add_style_tag(content="""
            @page {
                size: A4;
                margin: 18mm 16mm 18mm 16mm;
            }
            body {
                background: #fff !important;
                color: #111 !important;
                padding: 0 !important;
            }
            .manual-hero,
            .manual-section,
            .manual-panel,
            .manual-card {
                break-inside: avoid;
            }
            .manual-hero {
                background: #f0f4ff !important;
                color: #111 !important;
            }
            .manual-section-accent {
                background: #f5f5f5 !important;
            }
            a { color: #1a5fb4 !important; }
        """)

        await page.pdf(
            path=str(output_path),
            format="A4",
            print_background=True,
            margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
        )

        await browser.close()
        print(f"PDF généré : {output_path}")

if __name__ == "__main__":
    asyncio.run(generate())
