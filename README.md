# The Steiner Family Archive

A static, interactive family-chart website built from the family’s chart spreadsheet and four photographs.

The planned GitHub Pages deployment is public, as requested. The source workbook and other documents in `docs/` are not included in the published repository.

## Stitch the original photographs

The four complete source photographs are joined left-to-right in their numbered order as `assets/photos/steiner-family-tree-panorama.jpeg`. To recreate the panorama after updating the photos, run this script on macOS:

```sh
swift scripts/stitch_photos.swift
```

## Match gallery photos to people

On macOS, run `python3 scripts/import_person_photos.py` to match clearly named photos in `steiner_gallery/` to people in `data/tree.json`. Photos in `more_pics/Yael/` are explicitly assigned to Yael Feigin (row 50, column 9). The script copies matched photos into the published assets, reuses existing assets when the source image is an exact duplicate, creates smaller thumbnails, and writes `data/person-photos.json`. Names that cannot be identified confidently from their filenames are left unassigned. Original photo folders are excluded from the published repository. Select a person in the chart to view their matched photos.

## Sourced family details and related branches

`data/person-profiles.json` contains reviewed, source-attributed family facts from the family book, numbered family-list workbook, and selected entries in the Lindenfeld family list. Book citations use printed page numbers; workbook and list citations identify a sheet row or entry number. Approximate or uncertain dates are labeled as such. The book is from 2014, so it is not treated as a source for current details about living people. Email addresses, phone numbers, street addresses, and anonymized “Living” identities are not published. The profile card shows these facts separately from photo matches. Where repeated names cannot be matched confidently between charts and records, they remain unlinked.

Select Yael Feigin or Ze'ev Steiner, then choose **Explore the Feigin branch** to view the documented link through Yael's parents and her family with Ze'ev. The branch reuses the people in the main chart where their identities are confirmed. Use the family-view selector to switch between the full Steiner chart, the additional Steiner chart, and the Feigin branch. The additional chart remains separate rather than automatically merging duplicate-looking names.

The available sources identify Yael's parents, Schlomo Feigin and Hava Feigen [Buerger], and report both were born about 1920. The 2014 family book says they had one daughter, Yael. The supplied documents do not identify earlier Feigin or Buerger generations or other relatives in those families; those gaps are left explicit rather than inferred.

Opening the Feigin branch brings the chart section into view. Its compact layout adapts to narrow screens, while the original wide charts keep their own zoom and scroll behavior.

The original `docs/` files stay private. Reviewed family facts, cited source page numbers, and chart transcriptions are published as website data. To regenerate the two additional workbook views, install their local extraction dependency and run:

```sh
python3 -m pip install -r requirements-docs.txt
python3 scripts/export_legacy_chart.py
python3 scripts/export_steiner_list.py
```

The longer Lindenfeld list and the full MyHeritage report contain further information about relatives. Only reviewed facts matched to displayed people and included in `data/person-profiles.json` are published; unmatched identities and branches remain unlinked. The raw documents and contact details are not published.

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
