# The Steiner Family Archive

A static, interactive family-chart website built from the family’s chart spreadsheet and four photographs.

The planned GitHub Pages deployment is public, as requested. The source workbook and other documents in `docs/` are not included in the published repository.

## Preview locally

From the project folder, run:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Update the chart data

The generated `data/tree.json` preserves the chart’s workbook layout, connector lines, and names. To regenerate it after updating the source workbook, run:

```sh
python3 scripts/export_tree.py
```

The source documents in `docs/` are intentionally excluded from the published repository. The generated tree data and the four chart photographs are included in the website.

## Publish

The GitHub Actions workflow in `.github/workflows/pages.yml` deploys the site on pushes to `main`. Enable GitHub Pages for the repository with **GitHub Actions** as the build and deployment source.
